package client

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"

	commonv1 "github.com/owomide/proto/common/v1"
	intelligencepb "github.com/owomide/proto/services/intelligence/v1"
	marginpb "github.com/owomide/proto/services/margin/v1"

	"github.com/owomide/margin/internal/repo"
)

const (
	intelligenceSubject  = "margin_svc"
	intelligenceAudience = "data-pipeline"
)

// MarginEvaluator is the stateless boundary used by synchronous validation and
// breach monitoring. Margin still owns rule storage and violation policy.
type MarginEvaluator interface {
	EvaluateMargin(
		ctx context.Context,
		orgID string,
		rules []*repo.MarginRuleRow,
		items []*marginpb.ValidateItem,
		costs map[string]*commonv1.Money,
	) (*intelligencepb.EvaluateMarginBatchResponse, error)
}

type intelligenceClient struct {
	inner   intelligencepb.IntelligenceServiceClient
	secret  []byte
	issuer  string
	timeout time.Duration
}

func ValidEvaluationHash(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

// ValidateMarginEvaluation verifies that an Intelligence result is complete,
// internally consistent, and corresponds to the submitted Margin item.
func ValidateMarginEvaluation(
	item *marginpb.ValidateItem,
	result *intelligencepb.MarginEvaluationResult,
) error {
	if item == nil || item.ProposedPrice == nil {
		return errors.New("request item is missing proposed price")
	}
	if result == nil || result.ProposedPrice == nil {
		return errors.New("result is missing proposed price")
	}
	if result.ProposedPrice.Amount != item.ProposedPrice.Amount ||
		result.ProposedPrice.Currency != item.ProposedPrice.Currency {
		return errors.New("result proposed price does not match the request")
	}
	if !ValidEvaluationHash(result.EvaluationHash) {
		return errors.New("result has an invalid evaluation hash")
	}

	switch result.Status {
	case intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_NO_MATCH:
		if result.AppliedRuleId != nil || result.AppliedRuleVersion != nil ||
			result.Floor != nil || result.Gap != nil || result.Violated ||
			len(result.MatchedRuleIds) != 0 || result.ErrorCode != nil || result.ErrorMessage != nil {
			return errors.New("no-match result contains an applied outcome")
		}
		return nil
	case intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_MATCHED:
		if result.ErrorCode != nil || result.ErrorMessage != nil {
			return errors.New("matched result contains error details")
		}
		if err := validateAppliedRule(result); err != nil {
			return err
		}
		if result.Floor == nil || result.Gap == nil {
			return errors.New("matched result is missing money fields")
		}
		if result.Floor.Currency != item.ProposedPrice.Currency ||
			result.Gap.Currency != item.ProposedPrice.Currency {
			return errors.New("matched result currency does not match proposed price")
		}
		expectedGap := result.Floor.Amount - item.ProposedPrice.Amount
		if result.Violated {
			if expectedGap <= 0 || result.Gap.Amount != expectedGap {
				return errors.New("violated result has an invalid gap")
			}
		} else if expectedGap > 0 || result.Gap.Amount != 0 {
			return errors.New("clean result has an invalid gap")
		}
		return nil
	case intelligencepb.MarginEvaluationStatus_MARGIN_EVALUATION_STATUS_ERROR:
		if err := validateAppliedRule(result); err != nil {
			return err
		}
		if result.GetErrorCode() == "" || result.GetErrorMessage() == "" {
			return errors.New("error result is missing details")
		}
		if result.Floor != nil || result.Gap != nil || result.Violated {
			return errors.New("error result contains a computed outcome")
		}
		return nil
	default:
		return errors.New("result has an invalid status")
	}
}

func validateAppliedRule(result *intelligencepb.MarginEvaluationResult) error {
	if result.AppliedRuleId == nil || result.GetAppliedRuleId() == "" ||
		result.AppliedRuleVersion == nil || result.GetAppliedRuleVersion() <= 0 {
		return errors.New("result is missing applied rule provenance")
	}
	for _, ruleID := range result.MatchedRuleIds {
		if ruleID == result.GetAppliedRuleId() {
			return nil
		}
	}
	return errors.New("result does not include its applied rule")
}

func NewIntelligenceClient(
	conn grpc.ClientConnInterface,
	secret string,
	issuer string,
	timeout time.Duration,
) (MarginEvaluator, error) {
	if conn == nil {
		return nil, errors.New("intelligence gRPC connection is required")
	}
	if len(secret) < 32 {
		return nil, errors.New("intelligence service secret must be at least 32 characters")
	}
	if strings.TrimSpace(issuer) == "" {
		return nil, errors.New("service JWT issuer is required")
	}
	if timeout <= 0 {
		return nil, errors.New("intelligence timeout must be positive")
	}
	return &intelligenceClient{
		inner:   intelligencepb.NewIntelligenceServiceClient(conn),
		secret:  []byte(secret),
		issuer:  issuer,
		timeout: timeout,
	}, nil
}

func (c *intelligenceClient) EvaluateMargin(
	ctx context.Context,
	orgID string,
	rules []*repo.MarginRuleRow,
	items []*marginpb.ValidateItem,
	costs map[string]*commonv1.Money,
) (*intelligencepb.EvaluateMarginBatchResponse, error) {
	if strings.TrimSpace(orgID) == "" {
		return nil, errors.New("organization ID is required")
	}
	token, err := signServiceJWT(
		intelligenceSubject,
		intelligenceAudience,
		c.issuer,
		c.secret,
		time.Now().UTC(),
	)
	if err != nil {
		return nil, fmt.Errorf("sign intelligence credential: %w", err)
	}

	request, err := evaluationRequest(rules, items, costs)
	if err != nil {
		return nil, err
	}
	callCtx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()
	callCtx = metadata.AppendToOutgoingContext(
		callCtx,
		"authorization", "Bearer "+token,
		"x-org-id", orgID,
		"x-user-id", intelligenceSubject,
	)
	response, err := c.inner.EvaluateMarginBatch(callCtx, request)
	if err != nil {
		return nil, fmt.Errorf("intelligence EvaluateMarginBatch: %w", err)
	}
	return response, nil
}

func evaluationRequest(
	rules []*repo.MarginRuleRow,
	items []*marginpb.ValidateItem,
	costs map[string]*commonv1.Money,
) (*intelligencepb.EvaluateMarginBatchRequest, error) {
	request := &intelligencepb.EvaluateMarginBatchRequest{
		Rules: make([]*intelligencepb.MarginRuleDefinition, 0, len(rules)),
		Items: make([]*intelligencepb.MarginEvaluationItem, 0, len(items)),
	}
	for _, rule := range rules {
		definition, err := ruleDefinition(rule)
		if err != nil {
			return nil, err
		}
		request.Rules = append(request.Rules, definition)
	}
	for index, item := range items {
		if item == nil || item.ProposedPrice == nil {
			return nil, fmt.Errorf("evaluation item %d is missing proposed price", index)
		}
		definition := &intelligencepb.MarginEvaluationItem{
			ItemId:        strconv.Itoa(index),
			SkuId:         item.SkuId,
			ProposedPrice: item.ProposedPrice,
		}
		if item.ChannelId != "" {
			definition.ChannelId = &item.ChannelId
		}
		if cost := costs[item.SkuId]; cost != nil {
			definition.Cost = cost
		}
		request.Items = append(request.Items, definition)
	}
	return request, nil
}

func ruleDefinition(rule *repo.MarginRuleRow) (*intelligencepb.MarginRuleDefinition, error) {
	if rule == nil {
		return nil, errors.New("margin rule must not be nil")
	}
	var floorType intelligencepb.MarginFloorType
	switch rule.FloorType {
	case "pct_margin":
		floorType = intelligencepb.MarginFloorType_MARGIN_FLOOR_TYPE_PCT_MARGIN
	case "pct_markup":
		floorType = intelligencepb.MarginFloorType_MARGIN_FLOOR_TYPE_PCT_MARKUP
	case "absolute_minimum":
		floorType = intelligencepb.MarginFloorType_MARGIN_FLOOR_TYPE_ABSOLUTE_MINIMUM
	default:
		return nil, fmt.Errorf("margin rule %s has unsupported floor type %q", rule.ID, rule.FloorType)
	}

	definition := &intelligencepb.MarginRuleDefinition{
		RuleId:      rule.ID,
		RuleVersion: rule.Version,
		Currency:    rule.Currency,
		FloorType:   floorType,
		FloorValue:  rule.FloorValue,
	}
	var fact, value string
	switch {
	case rule.SkuID != nil:
		definition.Priority = 300
		fact, value = "sku_id", *rule.SkuID
	case rule.ChannelID != nil:
		definition.Priority = 200
		fact, value = "channel_id", *rule.ChannelID
	case rule.CategoryID != nil:
		definition.Priority = 100
		fact, value = "category_id", *rule.CategoryID
	}
	if fact != "" {
		definition.When = &intelligencepb.RulePredicate{
			Expression: &intelligencepb.RulePredicate_Condition{
				Condition: &intelligencepb.RuleCondition{
					Fact:     fact,
					Operator: intelligencepb.ConditionOperator_CONDITION_OPERATOR_EQUALS,
					Values: []*intelligencepb.RuleValue{{
						Kind: &intelligencepb.RuleValue_StringValue{StringValue: value},
					}},
				},
			},
		}
	}
	return definition, nil
}

func signServiceJWT(
	subject string,
	audience string,
	issuer string,
	secret []byte,
	now time.Time,
) (string, error) {
	header, err := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	if err != nil {
		return "", err
	}
	claims, err := json.Marshal(map[string]any{
		"aud": audience,
		"exp": now.Add(5 * time.Minute).Unix(),
		"iat": now.Unix(),
		"iss": issuer,
		"sub": subject,
	})
	if err != nil {
		return "", err
	}
	encoder := base64.RawURLEncoding
	unsigned := encoder.EncodeToString(header) + "." + encoder.EncodeToString(claims)
	mac := hmac.New(sha256.New, secret)
	if _, err := mac.Write([]byte(unsigned)); err != nil {
		return "", err
	}
	return unsigned + "." + encoder.EncodeToString(mac.Sum(nil)), nil
}
