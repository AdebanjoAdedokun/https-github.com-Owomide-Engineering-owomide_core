/**
 * Connection-ready domain contracts for the workspace prototype.
 *
 * These are intentionally transport-neutral. UI code consumes these shapes,
 * while an adapter decides whether they came from a design fixture or, after
 * the backend gates close, a generated OpenAPI client.
 */

/** @typedef {"DEMO_ONLY" | "CONTRACT_FIXTURE" | "LIVE"} TruthClass */
/** @typedef {"exact" | "unavailable"} TotalCountRelation */
/** @typedef {"bounded-sample" | "complete-page"} PageCoverage */
/** @typedef {"eligible" | "blocked" | "excluded" | "unpriced"} RepricingClassification */
/** @typedef {"margin" | "stale-cost" | "dimension" | "excluded" | "unpriced"} RepricingIssueKind */
/** @typedef {"apply-floor" | "exclude" | "refresh-cost" | "repair-dimension"} RepricingRemediationAction */
/** @typedef {"fixture-scenario" | "resource"} ResourceRefKind */
/** @typedef {"draft" | "blocked" | "submitted" | "approved"} ProposalState */
/** @typedef {"draft" | "blocked"} ProposalCreationState */
/** @typedef {"blocked" | "pending_override" | "ready_to_submit" | "awaiting_approval" | "approved_to_publish"} ProposalReadiness */
/** @typedef {"pending" | "approved" | "denied"} OverrideState */
/** @typedef {"approve" | "deny"} OverrideDecision */
/** @typedef {"unknown-outcome" | "incomplete" | "reconciling" | "published"} PublicationState */
/** @typedef {"unknown-outcome" | "reconciled"} ImportCommitState */

/**
 * @typedef {Object} Money
 * @property {string} amountMinor Decimal integer string in ISO 4217 minor units.
 * @property {string} currency ISO 4217 currency code.
 */

/**
 * @typedef {Object} ResourceRef
 * @property {ResourceRefKind} kind
 * @property {string} id
 * @property {string | null} version
 */

/**
 * @typedef {Object} DataProvenance
 * @property {TruthClass} truthClass
 * @property {string} adapter
 * @property {string | null} fixtureId
 * @property {string | null} fixtureVersion
 * @property {boolean} contractCompatibilityClaimed
 */

/**
 * @typedef {Object} ActionDenial
 * @property {"MISSING_PERMISSION" | "WRONG_ACTOR" | "WRONG_STATE" | "STALE_VERSION" | "FIELD_REDACTED" | "CAPABILITY_UNAVAILABLE" | "ALREADY_EXISTS" | "PROPOSAL_NOT_FOUND"} code
 * @property {string} message
 */

/**
 * @typedef {Object} ConfirmationMetadata
 * @property {string} title
 * @property {string} body
 * @property {string} confirmLabel
 * @property {string} consequenceCode
 */

/**
 * @typedef {Object} AllowedAction
 * @property {string} code
 * @property {boolean} enabled
 * @property {ActionDenial | null} reason
 * @property {string | null} requiredVersion
 * @property {ConfirmationMetadata | null} confirmation
 * @property {OverrideDecision | null} decision Explicit decision input for branch actions; null for non-decision actions.
 * @property {ResourceRef | null | undefined} [targetRef] Exact server-authored navigation target when this action opens an existing resource.
 */

/**
 * @typedef {Object} DomainErrorBody
 * @property {string} code
 * @property {string} message
 * @property {Record<string, unknown>} details
 * @property {boolean} retryable
 * @property {string | undefined} [domain]
 */

/**
 * @typedef {Object} DomainErrorEnvelope
 * @property {DomainErrorBody} error
 * @property {string} traceId
 */

/**
 * @typedef {Object} CursorPage
 * @property {string | null} cursor
 * @property {string | null} nextCursor
 * @property {number} returnedCount
 * @property {number} limit
 * @property {number | null} totalCount
 * @property {TotalCountRelation} totalCountRelation
 * @property {PageCoverage} coverage
 * @property {boolean} exhaustive
 */

/**
 * @typedef {Object} PopulationCounts
 * @property {number} requested
 * @property {number} matched
 * @property {number} priced
 * @property {number} selected
 * @property {number} eligible
 * @property {number} blocked
 * @property {number} excluded
 * @property {number} unpriced
 * @property {number} total
 */

/**
 * @typedef {Object} RepricingFacetOption
 * @property {string} id
 * @property {string} name
 * @property {number} sampleLineCount Count within the bounded fixture page, never an authoritative population count.
 * @property {boolean} selected
 */

/**
 * @typedef {Object} RepricingFacets
 * @property {"bounded-sample" | "complete-page"} coverage
 * @property {number} sampleLineCount
 * @property {RepricingFacetOption[]} channels
 * @property {RepricingFacetOption[]} locations
 */

/**
 * @typedef {Object} AppliedRepricingFilters
 * @property {string} query
 * @property {RepricingClassification | "all"} classification
 * @property {string | null} channelId
 * @property {string | null} locationId
 */

/**
 * @typedef {Object} RepricingFilterResult
 * @property {AppliedRepricingFilters} applied
 * @property {number} activeFilterCount Includes query, classification, channel and location when non-default.
 * @property {boolean} hasActiveFilters
 * @property {{availableLineCount: number, matchedLineCount: number, returnedLineCount: number}} sample
 * @property {{totalCount: number, filteredCount: null, affectedByFilters: false}} authoritativePopulation
 */

/**
 * @typedef {Object} RepricingLine
 * @property {string} id
 * @property {string} canonicalSkuId Stable UUID used by routes and resource references.
 * @property {string} merchantSku Organisation-scoped external identifier shown as “Merchant SKU”.
 * @property {{organisationId: string, label: "Merchant SKU"}} merchantSkuScope
 * @property {string} sku Backwards-compatible display alias for merchantSku.
 * @property {{name: string, variant: string}} product
 * @property {{id: string, name: string} | null} category
 * @property {{channel: {id: string, name: string}, location: {id: string, name: string}}} scope
 * @property {{skuId: string, channelId: string, categoryId: string | null, currency: string | null}} facts
 * @property {Money | null} currentCost
 * @property {"current" | "stale" | "missing"} costState
 * @property {Money | null} currentPrice
 * @property {Money | null} proposedPrice
 * @property {Money | null} absoluteDelta
 * @property {number | null} currentMarginBasisPoints
 * @property {number | null} proposedMarginBasisPoints
 * @property {RepricingClassification} classification
 * @property {boolean} selected
 * @property {string} effectiveAt RFC 3339 timestamp.
 * @property {{kind: RepricingIssueKind, code: string, message: string, persistent: boolean, allowedRemediations: RepricingRemediationAction[]} | null} issue
 * @property {RepricingRemediationAction[]} allowedRemediations
 * @property {{code: string, reason: string} | null} exclusion
 * @property {{refreshedCost?: Money, repairedFacts?: Record<string, unknown>} | null} remediationInputs
 * @property {{action: RepricingRemediationAction, fromPreviewRef: ResourceRef, appliedAt: string, explanation: string} | null} remediationEvidence
 * @property {{floorBasisPoints: number | null, floorPrice: Money | null, scope: string | null, sourceId: string | null, result: "clear" | "blocked" | "not-applicable", violation: {code: string, message: string, persistent: boolean, remediation: string, allowedRemediations?: RepricingRemediationAction[]} | null, evaluation: {status: "matched" | "no-match" | "error" | "not-required", appliedRule: AppliedMarginRule | null, matchingChain: AppliedMarginRule[], explanation: string, engineVersion: string, evaluationHash: string}}} policy
 * @property {{type: string, importId: string, fileName: string, importedAt: string, rowNumber: number, catalogVersion: string}} provenance
 */

/**
 * @typedef {Object} AppliedMarginRule
 * @property {string} id
 * @property {string} version
 * @property {string} name
 * @property {"sku" | "channel" | "category" | "organisation"} scope
 * @property {number} priority
 * @property {number} conditionCount
 * @property {"percentage-margin" | null} floorType
 * @property {number | null} floorBasisPoints
 * @property {string | null} currency
 */

/**
 * @typedef {Object} RepricingBlockerCounts
 * @property {number} total
 * @property {number} margin
 * @property {number} staleCost
 * @property {number} dimension
 */

/**
 * @typedef {Object} RepricingRemediationEvidence
 * @property {string} lineId
 * @property {RepricingRemediationAction} action
 * @property {ResourceRef} fromPreviewRef
 * @property {string} appliedAt
 * @property {string} explanation
 */

/**
 * @typedef {Object} RepricingPreview
 * @property {"repricing-preview"} kind
 * @property {ResourceRef} ref
 * @property {"fixture-only" | "persisted"} persistence
 * @property {string} title
 * @property {string} dataLabel
 * @property {boolean} dataLabelDismissible
 * @property {string} effectiveAt
 * @property {ResourceRef} scopeRef Exact persisted scope used to generate this Preview.
 * @property {ResourceRef} ruleRef Exact persisted rule used to generate this Preview.
 * @property {{type: string, changeBasisPoints: number | null, absoluteChange: Money | null, currency: string, rounding: string}} rule
 * @property {PopulationCounts} counts
 * @property {RepricingBlockerCounts} blockers
 * @property {RepricingLine[]} lines
 * @property {RepricingRemediationEvidence[]} remediationEvidence
 * @property {CursorPage} page
 * @property {RepricingFacets} facets
 * @property {RepricingFilterResult} filterResult
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} ProposalMarginEvidence
 * @property {"proposal-margin-evidence"} kind
 * @property {ResourceRef} proposalRef
 * @property {ResourceRef} sourcePreviewRef
 * @property {string} evaluatedAt
 * @property {{kind: "retained-rule-snapshot", version: string, label: string, effect: string, floorRangeBasisPoints: {minimum: number, maximum: number}}} policySnapshot
 * @property {{retained: number, unresolved: number, sampleAvailable: number}} counts
 * @property {RepricingLine[]} lines
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} ProposalComment
 * @property {"proposal-comment"} kind
 * @property {ResourceRef} ref
 * @property {ResourceRef} proposalRef
 * @property {{id: string, displayName: string}} actor
 * @property {string} body
 * @property {string} createdAt
 * @property {string | null} editedAt
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} ProposalCommentThread
 * @property {"proposal-comment-thread"} kind
 * @property {ResourceRef} proposalRef
 * @property {ProposalComment[]} items
 * @property {{cursor: string | null, nextCursor: string | null, returnedCount: number, limit: number, totalCount: number, totalCountRelation: "exact"}} page
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} ProposalDetail
 * @property {"proposal-detail"} kind
 * @property {ResourceRef} ref
 * @property {string} title
 * @property {ProposalState} state
 * @property {ProposalReadiness} readiness
 * @property {ResourceRef} sourcePreviewRef
 * @property {string} createdAt
 * @property {string} effectiveAt
 * @property {{id: string, displayName: string}} author
 * @property {{id: string, displayName: string}} assignedApprover
 * @property {{id: string, displayName: string}} assignedPublisher
 * @property {{selected: number, eligible: number, blocked: number}} counts
 * @property {{total: number, margin: number, staleCost: number, dimension: number}} blockers
 * @property {{costsRefreshed: number, dimensionsReconciled: number, auditSequences: number[]} | null | undefined} [operationalReconciliation] Explicit legacy FX-010 evidence; never implied by a margin override.
 * @property {OverrideRequest | null} override
 * @property {{state: "approved", actor: {id: string, displayName: string}, decidedAt: string, proposalVersion: string} | null} approval
 * @property {ResourceRef | null} publicationRef
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} OverrideRequest
 * @property {"override-request"} kind
 * @property {ResourceRef} ref
 * @property {OverrideState} state
 * @property {ResourceRef} proposalRef
 * @property {{id: string, displayName: string}} requester
 * @property {{id: string, displayName: string} | null} decider
 * @property {number} lineCount
 * @property {string} reason
 * @property {string} evidence
 * @property {string} expiresAt
 * @property {string} requestedAt
 * @property {string | null} decidedAt
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} PublicationOperation
 * @property {"publication-operation"} kind
 * @property {ResourceRef} ref
 * @property {PublicationState} state
 * @property {ResourceRef} proposalRef
 * @property {{id: string, displayName: string}} publisher
 * @property {string} idempotencyKey
 * @property {{requested: number, attempted: number, succeeded: number, failed: number, remaining: number, duplicateWrites: number}} counts
 * @property {string | null} supportId
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} AuditEvent
 * @property {string} id
 * @property {number} sequence
 * @property {string} occurredAt
 * @property {string} eventType
 * @property {{id: string, type: string, version: string}} object
 * @property {string | null} actorId
 * @property {string | null} actorRole
 * @property {string} sourceType
 * @property {Record<string, unknown> | null} before
 * @property {Record<string, unknown> | null} after
 * @property {string} reason
 * @property {boolean} isSynthetic
 */

/**
 * @typedef {Object} AuditHistory
 * @property {"audit-history"} kind
 * @property {string} proposalId
 * @property {AuditEvent[]} events
 * @property {{first: number, last: number, gaps: number}} sequence
 * @property {boolean} complete
 * @property {true} readOnlyEvidence
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} WorkspaceSession
 * @property {ResourceRef} ref
 * @property {{id: string, displayName: string}} actor
 * @property {{id: string, name: string, timezone: string, baseCurrency: string}} organisation
 * @property {string[]} roleCodes
 * @property {string[]} effectiveCapabilities
 * @property {string} capabilityVersion
 * @property {string} dataLabel
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} CatalogSkuSummary
 * @property {"catalog-sku-summary"} kind
 * @property {ResourceRef} ref
 * @property {string} id Canonical SKU UUID; route parameters bind this value.
 * @property {string} canonicalSkuId
 * @property {string} merchantSku Organisation-scoped external identifier.
 * @property {{organisationId: string, label: "Merchant SKU"}} merchantSkuScope
 * @property {{name: string, variant: string, family: string, pack: string}} product
 * @property {{id: string, code: string, name: string}} category
 * @property {{id: string, code: string, name: string}} channel
 * @property {{id: string, code: string, name: string, timezone: string}} location
 * @property {Money | null} currentCost
 * @property {"current" | "stale" | "missing" | "unavailable"} costState
 * @property {Money | null} currentPrice
 * @property {"current" | "stale" | "missing" | "superseded" | "unavailable"} priceState
 * @property {number | null} marginBasisPoints
 * @property {string} status
 * @property {string | null} effectiveAt
 * @property {Record<string, unknown>} source
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} CatalogSkuDetail
 * @property {"catalog-sku-detail"} kind
 * @property {ResourceRef} ref
 * @property {string} canonicalSkuId
 * @property {string} merchantSku
 * @property {CatalogSkuSummary} summary
 * @property {Array<{state: string, amount: Money | null, effectiveAt: string | null, supersededAt?: string | null, reason?: string}>} priceRecords
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @template T
 * @typedef {Object} OperationalList
 * @property {string} kind
 * @property {T[]} items
 * @property {CursorPage} page
 * @property {Record<string, unknown>} filterResult
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} ImportJourney
 * @property {"import-journey"} kind
 * @property {ResourceRef} ref
 * @property {string} title
 * @property {string} stage
 * @property {string} state
 * @property {Array<{id: string, label: string, status: "complete" | "current" | "upcoming"}>} stages
 * @property {Record<string, unknown>} sourceFile
 * @property {Record<string, unknown>} uploadPolicy
 * @property {Record<string, unknown>} profile
 * @property {Record<string, unknown>} mapping
 * @property {Record<string, unknown>} validation
 * @property {Record<string, unknown>} review
 * @property {Record<string, unknown>} commit
 * @property {Record<string, unknown>} result
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} RepricingScope
 * @property {"repricing-scope"} kind
 * @property {ResourceRef} ref
 * @property {string} title
 * @property {string} state
 * @property {PopulationCounts} counts
 * @property {Record<string, unknown>} selection
 * @property {Record<string, unknown>} dimensions
 * @property {Record<string, unknown>} filters
 * @property {{known: boolean, complete: boolean, historicalLimitApplied: boolean}} completeness
 * @property {string} dataLabel
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} RepricingRule
 * @property {"repricing-rule"} kind
 * @property {ResourceRef} ref
 * @property {ResourceRef} scopeRef
 * @property {string} state
 * @property {{type: string, changeBasisPoints: number | null, absoluteChange: Money | null, currency: string, rounding: string}} rule
 * @property {string[]} supportedTypes
 * @property {string} explanation
 * @property {string} effectiveAt
 * @property {string} dataLabel
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * Durable fixture evidence for the Import trust-boundary operation. The
 * operation is versioned separately from its batch so an unknown result cannot
 * be repeated as a second commit.
 * @typedef {Object} ImportCommitOperation
 * @property {"import-commit-operation"} kind
 * @property {ResourceRef} ref
 * @property {ResourceRef} batchRef
 * @property {ImportCommitState} state
 * @property {"awaiting-reconciliation" | "partial-success" | "committed"} status
 * @property {{attempted: number, committed: number | null, rejected: number | null, remaining: number | null}} counts
 * @property {string} idempotencyKey
 * @property {AllowedAction[]} allowedActions
 * @property {"Sample data"} dataLabel
 * @property {DataProvenance} provenance
 */

/**
 * @typedef {Object} ProposalHandoff
 * @property {"proposal-handoff"} kind
 * @property {ResourceRef} ref
 * @property {string} title
 * @property {ProposalCreationState} state
 * @property {ResourceRef} sourcePreviewRef
 * @property {string | null} createdAt
 * @property {string} effectiveAt
 * @property {{id: string, displayName: string}} author
 * @property {{selected: number, eligible: number, blocked: number}} counts
 * @property {AllowedAction[]} allowedActions
 * @property {DataProvenance} provenance
 */

/**
 * @template T
 * @typedef {Object} MutationResult
 * @property {T} data
 * @property {{idempotencyKey: string, applied: boolean, deduplicated: boolean, authoritative: boolean}} mutation
 */

/**
 * @typedef {Object} GetRepricingPreviewRequest
 * @property {ResourceRef | undefined} [ref]
 * @property {string | undefined} [query]
 * @property {RepricingClassification | "all" | undefined} [classification]
 * @property {string | undefined} [channelId]
 * @property {string | undefined} [locationId]
 * @property {string | null | undefined} [cursor]
 * @property {number | undefined} [limit]
 */

/**
 * @typedef {Object} CreateProposalRequest
 * @property {ResourceRef} sourcePreviewRef
 * @property {string} idempotencyKey
 * @property {string | undefined} [title]
 */

/**
 * @typedef {Object} IdentityRepository
 * @property {() => Promise<WorkspaceSession>} getSession
 * @property {(() => Promise<WorkspaceSession>) | undefined} [signIn] Fixture and eventual live authentication entry point.
 * @property {(() => Promise<{authenticated: false, provenance: DataProvenance}>) | undefined} [signOut]
 */

/**
 * Fixture-only evidence extension. Production identity repositories must not
 * implement or expose this surface to product components.
 * @typedef {Object} FixtureEvidenceIdentityExtension
 * @property {() => Promise<WorkspaceSession[]>} listDesignEvidenceActors
 * @property {(actorId: string) => Promise<WorkspaceSession>} selectDesignEvidenceActor
 */

/** @typedef {IdentityRepository & FixtureEvidenceIdentityExtension} FixtureIdentityRepositoryContract */

/**
 * @typedef {Object} WorkspaceTransport
 * @property {"fixture-memory" | "generated-live" | "custom"} kind
 * @property {boolean} liveNetworkEnabled
 */

/**
 * @typedef {Object} RepricingRepository
 * @property {(request?: GetRepricingPreviewRequest) => Promise<RepricingPreview>} getPreview
 * @property {(request?: {ref?: ResourceRef}) => Promise<RepricingScope>} getScope
 * @property {(request?: {ref?: ResourceRef}) => Promise<RepricingRule>} getRule
 * @property {(request: {title?: string, filters?: Record<string, unknown>, selection?: Record<string, unknown>, idempotencyKey: string}) => Promise<MutationResult<RepricingScope>>} createScope
 * @property {(request: {scopeRef: ResourceRef, title?: string, filters?: Record<string, unknown>, selection?: Record<string, unknown>, idempotencyKey: string}) => Promise<MutationResult<RepricingScope>>} updateScope
 * @property {(request: {scopeRef: ResourceRef, ruleRef?: ResourceRef, rule: Record<string, unknown>, effectiveAt: string, idempotencyKey: string}) => Promise<MutationResult<RepricingRule>>} saveRule
 * @property {(request: {ruleRef: ResourceRef, idempotencyKey: string}) => Promise<MutationResult<RepricingPreview>>} generatePreview
 * @property {(request: {previewRef: ResourceRef, lineId: string, action: RepricingRemediationAction, idempotencyKey: string}) => Promise<MutationResult<RepricingPreview>>} remediateLine
 */

/**
 * @typedef {Object} ProposalRepository
 * @property {(request?: {query?: string, state?: string, cursor?: string | null, limit?: number}) => Promise<OperationalList<Record<string, unknown>>>} list
 * @property {(request: CreateProposalRequest) => Promise<MutationResult<ProposalHandoff>>} createFromPreview
 * @property {(request?: {ref?: ResourceRef}) => Promise<ProposalDetail>} getDetail
 * @property {(request: {proposalRef: ResourceRef}) => Promise<ProposalMarginEvidence>} getMarginEvidence
 * @property {(request: {proposalRef: ResourceRef, cursor?: string | null, limit?: number}) => Promise<ProposalCommentThread>} listComments
 * @property {(request: {proposalRef: ResourceRef, idempotencyKey: string, body: string}) => Promise<MutationResult<ProposalComment>>} addComment
 * @property {(request: {proposalRef: ResourceRef, idempotencyKey: string, reason?: string, evidence?: string}) => Promise<MutationResult<{proposal: ProposalDetail, override: OverrideRequest}>>} requestOverride
 * @property {(request: {overrideRef: ResourceRef, decision: "approve" | "deny", idempotencyKey: string}) => Promise<MutationResult<{proposal: ProposalDetail, override: OverrideRequest}>>} decideOverride
 * @property {(request: {proposalRef: ResourceRef, idempotencyKey: string}) => Promise<MutationResult<ProposalDetail>>} submit
 * @property {(request: {proposalRef: ResourceRef, idempotencyKey: string}) => Promise<MutationResult<ProposalDetail>>} approve
 */

/**
 * @typedef {Object} PublicationRepository
 * @property {(request?: {operationRef?: ResourceRef}) => Promise<PublicationOperation>} get
 * @property {(request: {proposalRef: ResourceRef, idempotencyKey: string}) => Promise<MutationResult<PublicationOperation>>} start
 * @property {(request: {operationRef: ResourceRef}) => Promise<PublicationOperation>} reconcile
 * @property {(request: {operationRef: ResourceRef, idempotencyKey: string}) => Promise<MutationResult<PublicationOperation>>} retry
 */

/**
 * @typedef {Object} AuditRepository
 * @property {(request: {proposalId: string}) => Promise<AuditHistory>} getProposalHistory
 * @property {(request?: {entityType?: string, actorId?: string, eventType?: string, cursor?: string | null, limit?: number}) => Promise<OperationalList<AuditEvent>>} list
 * @property {(request: {entityType: string, entityId: string, cursor?: string | null, limit?: number}) => Promise<OperationalList<AuditEvent>>} getEntityHistory
 */

/** @typedef {{list: (request?: Record<string, unknown>) => Promise<OperationalList<Record<string, unknown>>>}} WorkQueueRepository */
/** @typedef {{list: (request?: Record<string, unknown>) => Promise<OperationalList<CatalogSkuSummary>>, getDetail: (request: {skuId: string}) => Promise<CatalogSkuDetail>}} CatalogRepository */
/**
 * @typedef {Object} ImportRepository
 * @property {(request?: Record<string, unknown>) => Promise<OperationalList<Record<string, unknown>>>} list
 * @property {(request: {batchId?: string, ref?: ResourceRef, version?: string, stage?: "profile" | "map" | "validate" | "review" | "commit" | "result"}) => Promise<ImportJourney>} getJourney
 * @property {(request: {intent: string, idempotencyKey: string}) => Promise<MutationResult<ImportJourney>>} create
 * @property {(request: {batchRef: ResourceRef, sourceFile: Record<string, unknown>, idempotencyKey: string}) => Promise<MutationResult<ImportJourney>>} upload
 * @property {(request: {batchRef: ResourceRef, idempotencyKey: string}) => Promise<MutationResult<ImportJourney>>} profile
 * @property {(request: {batchRef: ResourceRef, mapping: Record<string, unknown>, idempotencyKey: string}) => Promise<MutationResult<ImportJourney>>} saveMapping
 * @property {(request: {batchRef: ResourceRef, idempotencyKey: string}) => Promise<MutationResult<ImportJourney>>} validate
 * @property {(request: {batchRef: ResourceRef, acknowledgement: Record<string, unknown>, idempotencyKey: string}) => Promise<MutationResult<ImportJourney>>} acknowledgeReview
 * @property {(request: {batchRef: ResourceRef, idempotencyKey: string}) => Promise<MutationResult<{journey: ImportJourney, operation: ImportCommitOperation}>>} commit
 * @property {(request: {operationRef: ResourceRef}) => Promise<ImportCommitOperation>} getCommitOperation
 * @property {(request: {operationRef: ResourceRef, idempotencyKey: string}) => Promise<MutationResult<{journey: ImportJourney, operation: ImportCommitOperation}>>} reconcileCommit
 */
/** @typedef {{list: (request?: Record<string, unknown>) => Promise<OperationalList<Record<string, unknown>>>, getDetail: (request: {ruleId: string}) => Promise<Record<string, unknown>>}} RuleRepository */

/**
 * @typedef {Object} WorkspaceRepositories
 * @property {IdentityRepository} identity
 * @property {RepricingRepository} repricing
 * @property {ProposalRepository} proposals
 * @property {PublicationRepository} publishing
 * @property {AuditRepository} audit
 * @property {WorkQueueRepository} workQueue
 * @property {CatalogRepository} catalog
 * @property {ImportRepository} imports
 * @property {RuleRepository} rules
 * @property {WorkspaceTransport} transport
 */

/**
 * Concrete fixture composition. The evidence actor controls are intentionally
 * available only on this fixture-specific return type.
 * @typedef {Object} FixtureWorkspaceRepositories
 * @property {FixtureIdentityRepositoryContract} identity
 * @property {RepricingRepository} repricing
 * @property {ProposalRepository} proposals
 * @property {PublicationRepository} publishing
 * @property {AuditRepository} audit
 * @property {WorkQueueRepository} workQueue
 * @property {CatalogRepository} catalog
 * @property {ImportRepository} imports
 * @property {RuleRepository} rules
 * @property {{kind: "fixture-memory", liveNetworkEnabled: false}} transport
 */

export const ACTION_DENIAL_CODES = Object.freeze([
  "MISSING_PERMISSION",
  "WRONG_ACTOR",
  "WRONG_STATE",
  "STALE_VERSION",
  "FIELD_REDACTED",
  "CAPABILITY_UNAVAILABLE",
  "ALREADY_EXISTS",
  "PROPOSAL_NOT_FOUND",
]);

export const REPRICING_CLASSIFICATIONS = Object.freeze([
  "eligible",
  "blocked",
  "excluded",
  "unpriced",
]);

export const REPRICING_ISSUE_KINDS = Object.freeze([
  "margin",
  "stale-cost",
  "dimension",
  "excluded",
  "unpriced",
]);

export const REPRICING_REMEDIATION_ACTIONS = Object.freeze([
  "apply-floor",
  "exclude",
  "refresh-cost",
  "repair-dimension",
]);

export const RESOURCE_REF_KINDS = Object.freeze(["fixture-scenario", "resource"]);

/** @param {unknown} value @param {string} [path] @returns {asserts value is Money} */
export function assertMoney(value, path = "money") {
  if (!value || typeof value !== "object") throw new TypeError(`${path} must be an object.`);
  const money = /** @type {Record<string, unknown>} */ (value);
  if (typeof money.amountMinor !== "string" || !/^-?\d+$/.test(money.amountMinor)) {
    throw new TypeError(`${path}.amountMinor must be a decimal integer string.`);
  }
  if (typeof money.currency !== "string" || !/^[A-Z]{3}$/.test(money.currency)) {
    throw new TypeError(`${path}.currency must be an ISO 4217 code.`);
  }
}

/** @param {unknown} value @param {string} [path] @returns {asserts value is ResourceRef} */
export function assertResourceRef(value, path = "resourceRef") {
  if (!value || typeof value !== "object") throw new TypeError(`${path} must be an object.`);
  const ref = /** @type {Record<string, unknown>} */ (value);
  if (!RESOURCE_REF_KINDS.includes(/** @type {any} */ (ref.kind))) throw new TypeError(`${path}.kind is not supported.`);
  if (typeof ref.id !== "string" || !ref.id) throw new TypeError(`${path}.id is required.`);
  if (ref.version !== null && (typeof ref.version !== "string" || !ref.version)) throw new TypeError(`${path}.version must be a non-empty string or null.`);
}

/** @param {unknown} value @param {string} [path] @returns {asserts value is AllowedAction} */
export function assertAllowedAction(value, path = "allowedAction") {
  if (!value || typeof value !== "object") throw new TypeError(`${path} must be an object.`);
  const action = /** @type {Record<string, unknown>} */ (value);
  if (typeof action.code !== "string" || !action.code) throw new TypeError(`${path}.code is required.`);
  if (typeof action.enabled !== "boolean") throw new TypeError(`${path}.enabled must be boolean.`);
  if (action.enabled && action.reason !== null) throw new TypeError(`${path}.reason must be null when enabled.`);
  if (!action.enabled) {
    if (!action.reason || typeof action.reason !== "object") throw new TypeError(`${path}.reason is required when disabled.`);
    const reason = /** @type {Record<string, unknown>} */ (action.reason);
    if (!ACTION_DENIAL_CODES.includes(/** @type {any} */ (reason.code))) throw new TypeError(`${path}.reason.code is not stable.`);
    if (typeof reason.message !== "string" || !reason.message) throw new TypeError(`${path}.reason.message is required.`);
  }
  if (action.requiredVersion !== null && typeof action.requiredVersion !== "string") {
    throw new TypeError(`${path}.requiredVersion must be a string or null.`);
  }
  if (action.decision !== null && !["approve", "deny"].includes(/** @type {any} */ (action.decision))) {
    throw new TypeError(`${path}.decision must be approve, deny or null.`);
  }
  if (action.code === "override.approve" && action.decision !== "approve") {
    throw new TypeError(`${path}.decision must match override.approve.`);
  }
  if (action.code === "override.deny" && action.decision !== "deny") {
    throw new TypeError(`${path}.decision must match override.deny.`);
  }
  if (!["override.approve", "override.deny"].includes(/** @type {any} */ (action.code)) && action.decision !== null) {
    throw new TypeError(`${path}.decision is only valid for an explicit override branch action.`);
  }
  if (action.targetRef !== undefined && action.targetRef !== null) {
    assertResourceRef(action.targetRef, `${path}.targetRef`);
    const targetRef = /** @type {Record<string, unknown>} */ (action.targetRef);
    if (targetRef.version === null) {
      throw new TypeError(`${path}.targetRef must identify an exact version.`);
    }
    if (action.code === "proposal.read" && action.enabled && action.requiredVersion !== targetRef.version) {
      throw new TypeError(`${path}.requiredVersion must match the proposal.read target version.`);
    }
  }
}

/**
 * @param {AllowedAction[]} actions
 * @param {string} code
 * @returns {AllowedAction | null}
 */
export function findAllowedAction(actions, code) {
  return actions.find((action) => action.code === code) ?? null;
}

/** @param {unknown} value @param {string} [path] @returns {asserts value is CursorPage} */
export function assertCursorPage(value, path = "page") {
  if (!value || typeof value !== "object") throw new TypeError(`${path} must be an object.`);
  const page = /** @type {Record<string, any>} */ (value);
  if (page.cursor !== null && typeof page.cursor !== "string") throw new TypeError(`${path}.cursor must be a string or null.`);
  if (page.nextCursor !== null && typeof page.nextCursor !== "string") throw new TypeError(`${path}.nextCursor must be a string or null.`);
  for (const key of ["returnedCount", "limit"]) {
    if (!Number.isSafeInteger(page[key]) || page[key] < 0) throw new TypeError(`${path}.${key} must be a non-negative integer.`);
  }
  if (page.totalCount !== null && (!Number.isSafeInteger(page.totalCount) || page.totalCount < 0)) {
    throw new TypeError(`${path}.totalCount must be a non-negative integer or null.`);
  }
  if (!['exact', 'unavailable'].includes(page.totalCountRelation)) throw new TypeError(`${path}.totalCountRelation is not supported.`);
  if (!['bounded-sample', 'complete-page'].includes(page.coverage)) throw new TypeError(`${path}.coverage is not supported.`);
  if (typeof page.exhaustive !== "boolean") throw new TypeError(`${path}.exhaustive must be boolean.`);
  if (page.coverage === "bounded-sample" && page.exhaustive) throw new TypeError(`${path} cannot claim bounded sample exhaustion.`);
}

/** @param {unknown} value @param {string} [expectedKind] @returns {asserts value is OperationalList<unknown>} */
export function assertOperationalList(value, expectedKind) {
  if (!value || typeof value !== "object") throw new TypeError("operational list must be an object.");
  const list = /** @type {Record<string, any>} */ (value);
  if (expectedKind && list.kind !== expectedKind) throw new TypeError(`operational list kind must be ${expectedKind}.`);
  if (!Array.isArray(list.items)) throw new TypeError("operational list items must be an array.");
  assertCursorPage(list.page, "operationalList.page");
  if (list.page.returnedCount !== list.items.length) throw new TypeError("operational list returned count must match items.");
  if (!Array.isArray(list.allowedActions)) throw new TypeError("operational list allowedActions must be an array.");
  list.allowedActions.forEach((action, index) => assertAllowedAction(action, `operationalList.allowedActions[${index}]`));
  if (!list.provenance || list.provenance.truthClass !== "DEMO_ONLY") throw new TypeError("operational list must preserve fixture provenance.");
}

/** @param {unknown} value @returns {asserts value is CatalogSkuSummary} */
export function assertCatalogSkuSummary(value) {
  if (!value || typeof value !== "object") throw new TypeError("catalog SKU must be an object.");
  const sku = /** @type {Record<string, any>} */ (value);
  if (sku.kind !== "catalog-sku-summary") throw new TypeError("catalog SKU kind must be catalog-sku-summary.");
  assertResourceRef(sku.ref, "catalogSku.ref");
  if (sku.id !== sku.ref.id || sku.canonicalSkuId !== sku.ref.id) throw new TypeError("catalog SKU route identity must use the canonical UUID.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sku.canonicalSkuId)) {
    throw new TypeError("catalog SKU canonical ID must be UUID-shaped.");
  }
  if (typeof sku.merchantSku !== "string" || !sku.merchantSku) throw new TypeError("catalog SKU merchantSku is required.");
  if (sku.merchantSkuScope?.label !== "Merchant SKU") throw new TypeError("catalog SKU external identity must be labelled Merchant SKU.");
  if (sku.currentCost !== null) assertMoney(sku.currentCost, "catalogSku.currentCost");
  if (sku.currentPrice !== null) assertMoney(sku.currentPrice, "catalogSku.currentPrice");
  if (!Array.isArray(sku.allowedActions)) throw new TypeError("catalog SKU allowedActions must be an array.");
  sku.allowedActions.forEach((action, index) => assertAllowedAction(action, `catalogSku.allowedActions[${index}]`));
}

/** @param {unknown} value @returns {asserts value is ImportJourney} */
export function assertImportJourney(value) {
  if (!value || typeof value !== "object") throw new TypeError("import journey must be an object.");
  const journey = /** @type {Record<string, any>} */ (value);
  if (journey.kind !== "import-journey") throw new TypeError("import journey kind must be import-journey.");
  assertResourceRef(journey.ref, "importJourney.ref");
  const expected = ["upload", "profile", "map", "validate", "review", "commit", "result"];
  if (!Array.isArray(journey.stages) || journey.stages.map((stage) => stage.id).join("|") !== expected.join("|")) {
    throw new TypeError("import journey must preserve all seven trust-boundary stages.");
  }
  const counts = journey.result?.counts;
  if (!counts || counts.committed + counts.rejected !== counts.attempted || counts.input !== counts.valid + counts.invalid + counts.excluded) {
    throw new TypeError("import journey row accounting is inconsistent.");
  }
  if (counts.remaining !== counts.input - counts.committed - counts.rejected - counts.excluded) {
    throw new TypeError("import journey remaining count is inconsistent.");
  }
  if (!Array.isArray(journey.allowedActions)) throw new TypeError("import journey allowedActions must be an array.");
  journey.allowedActions.forEach((action, index) => assertAllowedAction(action, `importJourney.allowedActions[${index}]`));
}

/** @param {unknown} value @returns {asserts value is ImportCommitOperation} */
export function assertImportCommitOperation(value) {
  if (!value || typeof value !== "object") throw new TypeError("import commit operation must be an object.");
  const operation = /** @type {Record<string, any>} */ (value);
  if (operation.kind !== "import-commit-operation") throw new TypeError("import commit operation kind is not supported.");
  assertResourceRef(operation.ref, "importCommitOperation.ref");
  assertResourceRef(operation.batchRef, "importCommitOperation.batchRef");
  if (operation.ref.version === null || operation.batchRef.version === null) {
    throw new TypeError("import commit operation and batch references must be exact versions.");
  }
  if (!["unknown-outcome", "reconciled"].includes(operation.state)) {
    throw new TypeError("import commit operation state is not supported.");
  }
  const counts = operation.counts;
  if (!counts || !Number.isSafeInteger(counts.attempted) || counts.attempted < 0) throw new TypeError("import attempted count must be a non-negative integer.");
  if (operation.state === "unknown-outcome") {
    if (operation.status !== "awaiting-reconciliation" || counts.committed !== null || counts.rejected !== null || counts.remaining !== null) {
      throw new TypeError("unknown import outcome must not invent committed, rejected or remaining counts.");
    }
  } else {
    if (![counts.committed, counts.rejected, counts.remaining].every((count) => Number.isSafeInteger(count) && count >= 0)) {
      throw new TypeError("reconciled import counts must be non-negative integers.");
    }
    if (!["partial-success", "committed"].includes(operation.status) || counts.committed + counts.rejected !== counts.attempted) {
      throw new TypeError("reconciled import attempt counts must balance.");
    }
  }
  if (operation.dataLabel !== "Sample data") throw new TypeError("import commit operation must retain the Sample data boundary.");
  if (!Array.isArray(operation.allowedActions)) throw new TypeError("import commit operation allowedActions must be an array.");
  operation.allowedActions.forEach((action, index) => assertAllowedAction(action, `importCommitOperation.allowedActions[${index}]`));
}

/** @param {unknown} value @returns {asserts value is RepricingScope} */
export function assertRepricingScope(value) {
  if (!value || typeof value !== "object") throw new TypeError("repricing scope must be an object.");
  const scope = /** @type {Record<string, any>} */ (value);
  if (scope.kind !== "repricing-scope") throw new TypeError("repricing scope kind must be repricing-scope.");
  assertResourceRef(scope.ref, "repricingScope.ref");
  if (!scope.completeness?.known || !scope.completeness?.complete || scope.completeness?.historicalLimitApplied) {
    throw new TypeError("fixture repricing scope must be explicitly complete without a historical page limit.");
  }
  if (scope.counts.eligible + scope.counts.excluded + scope.counts.blocked + scope.counts.unpriced !== scope.counts.matched) {
    throw new TypeError("repricing scope counts do not reconcile.");
  }
  scope.allowedActions.forEach((action, index) => assertAllowedAction(action, `repricingScope.allowedActions[${index}]`));
}

/** @param {unknown} value @returns {asserts value is RepricingRule} */
export function assertRepricingRule(value) {
  if (!value || typeof value !== "object") throw new TypeError("repricing rule must be an object.");
  const rule = /** @type {Record<string, any>} */ (value);
  if (rule.kind !== "repricing-rule") throw new TypeError("repricing rule kind must be repricing-rule.");
  assertResourceRef(rule.ref, "repricingRule.ref");
  assertResourceRef(rule.scopeRef, "repricingRule.scopeRef");
  if (!['percentage-change', 'absolute-change'].includes(rule.rule?.type)) throw new TypeError("repricing rule type is not supported.");
  if (rule.rule.type === "percentage-change" && !Number.isSafeInteger(rule.rule.changeBasisPoints)) {
    throw new TypeError("percentage repricing rule requires integer basis points.");
  }
  rule.allowedActions.forEach((action, index) => assertAllowedAction(action, `repricingRule.allowedActions[${index}]`));
}

/** @param {unknown} value @returns {asserts value is RepricingPreview} */
export function assertRepricingPreview(value) {
  if (!value || typeof value !== "object") throw new TypeError("preview must be an object.");
  const preview = /** @type {Record<string, any>} */ (value);
  if (preview.kind !== "repricing-preview") throw new TypeError("preview.kind must be repricing-preview.");
  assertResourceRef(preview.scopeRef, "preview.scopeRef");
  assertResourceRef(preview.ruleRef, "preview.ruleRef");
  if (preview.scopeRef.version === null || preview.ruleRef.version === null) {
    throw new TypeError("preview must retain exact scope and rule versions.");
  }
  const counts = preview.counts;
  if (!counts || counts.eligible + counts.excluded + counts.blocked + counts.unpriced !== counts.matched) {
    throw new TypeError("preview population accounting is inconsistent.");
  }
  if (counts.selected !== counts.eligible + counts.blocked) {
    throw new TypeError("preview selected count must preserve eligible and blocked lines.");
  }
  if (counts.priced !== counts.eligible + counts.blocked + counts.excluded) {
    throw new TypeError("preview priced count must preserve selected and explicitly excluded priced lines.");
  }
  if (counts.total !== counts.matched || counts.requested !== counts.matched) {
    throw new TypeError("fixture preview requested, matched and total counts must reconcile.");
  }
  const blockers = preview.blockers;
  if (!blockers || blockers.total !== blockers.margin + blockers.staleCost + blockers.dimension || blockers.total !== counts.blocked) {
    throw new TypeError("preview blocker accounting is inconsistent.");
  }
  if (!Array.isArray(preview.lines)) throw new TypeError("preview.lines must be an array.");
  preview.lines.forEach((line, index) => {
    const path = `preview.lines[${index}]`;
    if (!REPRICING_CLASSIFICATIONS.includes(line.classification)) throw new TypeError(`${path}.classification is not supported.`);
    if (typeof line.selected !== "boolean") throw new TypeError(`${path}.selected must be boolean.`);
    if (["eligible", "blocked"].includes(line.classification) !== line.selected) {
      throw new TypeError(`${path}.selected must agree with its classification.`);
    }
    if (!line.category && line.facts?.categoryId !== null) throw new TypeError(`${path}.category and facts.categoryId are inconsistent.`);
    if (line.currentCost !== null) assertMoney(line.currentCost, `${path}.currentCost`);
    if (line.currentPrice !== null) assertMoney(line.currentPrice, `${path}.currentPrice`);
    if (line.proposedPrice !== null) assertMoney(line.proposedPrice, `${path}.proposedPrice`);
    if (line.absoluteDelta !== null) assertMoney(line.absoluteDelta, `${path}.absoluteDelta`);
    if (line.policy?.floorPrice !== null) assertMoney(line.policy?.floorPrice, `${path}.policy.floorPrice`);
    if (!Array.isArray(line.allowedRemediations) || line.allowedRemediations.some((action) => !REPRICING_REMEDIATION_ACTIONS.includes(action))) {
      throw new TypeError(`${path}.allowedRemediations contains an unsupported action.`);
    }
    if (line.classification === "eligible" && line.issue !== null) throw new TypeError(`${path}.issue must be null when eligible.`);
    if (line.classification !== "eligible") {
      if (!line.issue || !REPRICING_ISSUE_KINDS.includes(line.issue.kind)) throw new TypeError(`${path}.issue is required for a non-eligible line.`);
      if (!Array.isArray(line.issue.allowedRemediations)) throw new TypeError(`${path}.issue.allowedRemediations must be an array.`);
    }
    if (line.classification === "blocked" && !["margin", "stale-cost", "dimension"].includes(line.issue?.kind)) {
      throw new TypeError(`${path}.blocked issue kind is not supported.`);
    }
    if (line.classification === "unpriced" && (line.currentPrice !== null || line.proposedPrice !== null)) {
      throw new TypeError(`${path}.unpriced line cannot claim current or proposed money.`);
    }
    if (line.classification === "excluded" && !line.exclusion) throw new TypeError(`${path}.exclusion evidence is required.`);
    const evaluation = line.policy?.evaluation;
    if (!evaluation || !["matched", "no-match", "error", "not-required"].includes(evaluation.status)) {
      throw new TypeError(`${path}.policy.evaluation status is not supported.`);
    }
    if (typeof evaluation.engineVersion !== "string" || !evaluation.engineVersion) throw new TypeError(`${path}.policy.evaluation.engineVersion is required.`);
    if (typeof evaluation.evaluationHash !== "string" || !evaluation.evaluationHash) throw new TypeError(`${path}.policy.evaluation.evaluationHash is required.`);
    if (!Array.isArray(evaluation.matchingChain)) throw new TypeError(`${path}.policy.evaluation.matchingChain must be an array.`);
    evaluation.matchingChain.forEach((rule, ruleIndex) => {
      if (!rule || typeof rule.id !== "string" || !Number.isSafeInteger(rule.priority) || !Number.isSafeInteger(rule.conditionCount)) {
        throw new TypeError(`${path}.policy.evaluation.matchingChain[${ruleIndex}] is invalid.`);
      }
    });
    if (evaluation.appliedRule && evaluation.appliedRule.id !== evaluation.matchingChain[0]?.id) {
      throw new TypeError(`${path}.policy.evaluation.appliedRule must lead the matching chain.`);
    }
  });
  if (!Array.isArray(preview.remediationEvidence)) throw new TypeError("preview.remediationEvidence must be an array.");
  preview.remediationEvidence.forEach((evidence, index) => {
    if (!REPRICING_REMEDIATION_ACTIONS.includes(evidence.action)) throw new TypeError(`preview.remediationEvidence[${index}].action is not supported.`);
    assertResourceRef(evidence.fromPreviewRef, `preview.remediationEvidence[${index}].fromPreviewRef`);
  });
  if (!preview.facets || preview.facets.coverage !== "bounded-sample") {
    throw new TypeError("preview.facets must declare bounded-sample coverage.");
  }
  if (!Array.isArray(preview.facets.channels) || !Array.isArray(preview.facets.locations)) {
    throw new TypeError("preview.facets must include channel and location options.");
  }
  for (const [facetName, options] of [["channels", preview.facets.channels], ["locations", preview.facets.locations]]) {
    options.forEach((option, index) => {
      if (typeof option.id !== "string" || typeof option.name !== "string") {
        throw new TypeError(`preview.facets.${facetName}[${index}] requires id and name.`);
      }
      if (!Number.isSafeInteger(option.sampleLineCount) || option.sampleLineCount < 1) {
        throw new TypeError(`preview.facets.${facetName}[${index}].sampleLineCount must be a positive integer.`);
      }
      if (typeof option.selected !== "boolean") {
        throw new TypeError(`preview.facets.${facetName}[${index}].selected must be boolean.`);
      }
    });
  }
  if (!preview.filterResult || preview.filterResult.authoritativePopulation?.affectedByFilters !== false) {
    throw new TypeError("preview.filterResult must preserve authoritative population accounting.");
  }
  if (preview.filterResult.authoritativePopulation.filteredCount !== null) {
    throw new TypeError("bounded fixture filters must not claim an authoritative filtered count.");
  }
  if (preview.filterResult.sample.returnedLineCount !== preview.lines.length) {
    throw new TypeError("preview.filterResult returned sample count must match preview.lines.");
  }
  if (!Array.isArray(preview.allowedActions)) throw new TypeError("preview.allowedActions must be an array.");
  preview.allowedActions.forEach((action, index) => assertAllowedAction(action, `preview.allowedActions[${index}]`));
}

/** @param {unknown} value @returns {asserts value is ProposalHandoff} */
export function assertProposalHandoff(value) {
  if (!value || typeof value !== "object") throw new TypeError("proposal must be an object.");
  const proposal = /** @type {Record<string, any>} */ (value);
  if (proposal.kind !== "proposal-handoff" || !["draft", "blocked"].includes(proposal.state)) throw new TypeError("proposal creation handoff must remain draft or blocked.");
  assertResourceRef(proposal.ref, "proposal.ref");
  assertResourceRef(proposal.sourcePreviewRef, "proposal.sourcePreviewRef");
  if (proposal.counts.selected !== proposal.counts.eligible + proposal.counts.blocked) {
    throw new TypeError("proposal counts do not preserve the source selection.");
  }
  if (!Array.isArray(proposal.allowedActions)) throw new TypeError("proposal.allowedActions must be an array.");
  proposal.allowedActions.forEach((action, index) => assertAllowedAction(action, `proposal.allowedActions[${index}]`));
}

/** @param {unknown} value @returns {asserts value is ProposalDetail} */
export function assertProposalDetail(value) {
  if (!value || typeof value !== "object") throw new TypeError("proposal detail must be an object.");
  const proposal = /** @type {Record<string, any>} */ (value);
  if (proposal.kind !== "proposal-detail") throw new TypeError("proposal.kind must be proposal-detail.");
  if (!["draft", "blocked", "submitted", "approved"].includes(proposal.state)) {
    throw new TypeError("proposal.state is not supported.");
  }
  if (!["blocked", "pending_override", "ready_to_submit", "awaiting_approval", "approved_to_publish"].includes(proposal.readiness)) {
    throw new TypeError("proposal.readiness is not supported.");
  }
  assertResourceRef(proposal.ref, "proposal.ref");
  if (proposal.ref.version === null) throw new TypeError("proposal.ref must be versioned.");
  assertResourceRef(proposal.sourcePreviewRef, "proposal.sourcePreviewRef");
  if (proposal.counts.selected !== proposal.counts.eligible + proposal.counts.blocked) {
    throw new TypeError("proposal counts do not preserve the selected population.");
  }
  if (proposal.blockers.total !== proposal.counts.blocked) {
    throw new TypeError("proposal blocker totals must reconcile with counts.blocked.");
  }
  if (proposal.blockers.total !== proposal.blockers.margin + proposal.blockers.staleCost + proposal.blockers.dimension) {
    throw new TypeError("proposal blocker categories must reconcile with blockers.total.");
  }
  if (proposal.operationalReconciliation != null) {
    const reconciliation = proposal.operationalReconciliation;
    if (![reconciliation.costsRefreshed, reconciliation.dimensionsReconciled].every((count) => Number.isSafeInteger(count) && count >= 0)) {
      throw new TypeError("proposal operational reconciliation counts must be non-negative integers.");
    }
    if (!Array.isArray(reconciliation.auditSequences) || reconciliation.auditSequences.some((sequence) => !Number.isSafeInteger(sequence))) {
      throw new TypeError("proposal operational reconciliation requires integer audit sequences.");
    }
  }
  if (!Array.isArray(proposal.allowedActions)) throw new TypeError("proposal.allowedActions must be an array.");
  proposal.allowedActions.forEach((action, index) => assertAllowedAction(action, `proposal.allowedActions[${index}]`));
}

/** @param {unknown} value @returns {asserts value is ProposalMarginEvidence} */
export function assertProposalMarginEvidence(value) {
  if (!value || typeof value !== "object") throw new TypeError("proposal margin evidence must be an object.");
  const evidence = /** @type {Record<string, any>} */ (value);
  if (evidence.kind !== "proposal-margin-evidence") throw new TypeError("proposal margin evidence kind is not supported.");
  assertResourceRef(evidence.proposalRef, "proposalMarginEvidence.proposalRef");
  assertResourceRef(evidence.sourcePreviewRef, "proposalMarginEvidence.sourcePreviewRef");
  if (evidence.proposalRef.version === null || evidence.sourcePreviewRef.version === null) {
    throw new TypeError("proposal margin evidence must retain exact Proposal and Preview versions.");
  }
  if (!evidence.policySnapshot || evidence.policySnapshot.kind !== "retained-rule-snapshot") {
    throw new TypeError("proposal margin evidence requires a retained rule snapshot.");
  }
  for (const key of ["minimum", "maximum"]) {
    if (!Number.isSafeInteger(evidence.policySnapshot.floorRangeBasisPoints?.[key])) {
      throw new TypeError(`proposal margin ${key} floor must use integer basis points.`);
    }
  }
  if (!Array.isArray(evidence.lines)) throw new TypeError("proposal margin evidence lines must be an array.");
  if (evidence.counts?.sampleAvailable !== evidence.lines.length) throw new TypeError("proposal margin sample count must match its returned lines.");
  if (!Number.isSafeInteger(evidence.counts?.retained) || !Number.isSafeInteger(evidence.counts?.unresolved)) {
    throw new TypeError("proposal margin evidence counts must be integers.");
  }
  if (!Array.isArray(evidence.allowedActions)) throw new TypeError("proposal margin allowedActions must be an array.");
  evidence.allowedActions.forEach((action, index) => assertAllowedAction(action, `proposalMarginEvidence.allowedActions[${index}]`));
}

/** @param {unknown} value @returns {asserts value is ProposalComment} */
export function assertProposalComment(value) {
  if (!value || typeof value !== "object") throw new TypeError("proposal comment must be an object.");
  const comment = /** @type {Record<string, any>} */ (value);
  if (comment.kind !== "proposal-comment") throw new TypeError("proposal comment kind is not supported.");
  assertResourceRef(comment.ref, "proposalComment.ref");
  assertResourceRef(comment.proposalRef, "proposalComment.proposalRef");
  if (comment.ref.version === null || comment.proposalRef.version === null) throw new TypeError("proposal comments must retain exact versions.");
  if (!comment.actor?.id || !comment.actor?.displayName) throw new TypeError("proposal comment requires a resolved human actor.");
  if (typeof comment.body !== "string" || !comment.body.trim() || comment.body.length > 2000) throw new TypeError("proposal comment body is invalid.");
  if (typeof comment.createdAt !== "string" || !comment.createdAt) throw new TypeError("proposal comment createdAt is required.");
}

/** @param {unknown} value @returns {asserts value is ProposalCommentThread} */
export function assertProposalCommentThread(value) {
  if (!value || typeof value !== "object") throw new TypeError("proposal comment thread must be an object.");
  const thread = /** @type {Record<string, any>} */ (value);
  if (thread.kind !== "proposal-comment-thread") throw new TypeError("proposal comment thread kind is not supported.");
  assertResourceRef(thread.proposalRef, "proposalCommentThread.proposalRef");
  if (thread.proposalRef.version === null) throw new TypeError("proposal comment thread must retain an exact Proposal version.");
  if (!Array.isArray(thread.items)) throw new TypeError("proposal comment thread items must be an array.");
  thread.items.forEach((comment) => {
    assertProposalComment(comment);
    if (comment.proposalRef.id !== thread.proposalRef.id || comment.proposalRef.version !== thread.proposalRef.version) {
      throw new TypeError("proposal comment must belong to the exact thread version.");
    }
  });
  const page = thread.page;
  if (!page || page.returnedCount !== thread.items.length || page.totalCount < thread.items.length || page.totalCountRelation !== "exact") {
    throw new TypeError("proposal comment thread pagination is inconsistent.");
  }
  if (!Array.isArray(thread.allowedActions)) throw new TypeError("proposal comment thread allowedActions must be an array.");
  thread.allowedActions.forEach((action, index) => assertAllowedAction(action, `proposalCommentThread.allowedActions[${index}]`));
}

/** @param {unknown} value @returns {asserts value is OverrideRequest} */
export function assertOverrideRequest(value) {
  if (!value || typeof value !== "object") throw new TypeError("override must be an object.");
  const override = /** @type {Record<string, any>} */ (value);
  if (override.kind !== "override-request") throw new TypeError("override.kind must be override-request.");
  if (!["pending", "approved", "denied"].includes(override.state)) throw new TypeError("override.state is not supported.");
  assertResourceRef(override.ref, "override.ref");
  if (override.ref.version === null) throw new TypeError("override.ref must be versioned.");
  assertResourceRef(override.proposalRef, "override.proposalRef");
  if (!Number.isSafeInteger(override.lineCount) || override.lineCount < 1) throw new TypeError("override.lineCount must be positive.");
  if (!Array.isArray(override.allowedActions)) throw new TypeError("override.allowedActions must be an array.");
  override.allowedActions.forEach((action, index) => assertAllowedAction(action, `override.allowedActions[${index}]`));
}

/** @param {unknown} value @returns {asserts value is PublicationOperation} */
export function assertPublicationOperation(value) {
  if (!value || typeof value !== "object") throw new TypeError("publication must be an object.");
  const publication = /** @type {Record<string, any>} */ (value);
  if (publication.kind !== "publication-operation") throw new TypeError("publication.kind must be publication-operation.");
  if (!["unknown-outcome", "incomplete", "reconciling", "published"].includes(publication.state)) {
    throw new TypeError("publication.state is not supported.");
  }
  assertResourceRef(publication.ref, "publication.ref");
  if (publication.ref.version === null) throw new TypeError("publication.ref must be versioned.");
  assertResourceRef(publication.proposalRef, "publication.proposalRef");
  const counts = publication.counts;
  const unknownCountsAreHonest = publication.state === "unknown-outcome"
    && counts.succeeded === 0
    && counts.failed === 0
    && counts.remaining === counts.requested;
  const resolvedCountsReconcile = publication.state !== "unknown-outcome"
    && counts.remaining === counts.failed
    && counts.succeeded + counts.remaining === counts.requested;
  if (!unknownCountsAreHonest && !resolvedCountsReconcile) {
    throw new TypeError("publication counts do not reconcile.");
  }
  if (!Array.isArray(publication.allowedActions)) throw new TypeError("publication.allowedActions must be an array.");
  publication.allowedActions.forEach((action, index) => assertAllowedAction(action, `publication.allowedActions[${index}]`));
}

/** @param {unknown} value @returns {asserts value is AuditHistory} */
export function assertAuditHistory(value) {
  if (!value || typeof value !== "object") throw new TypeError("audit history must be an object.");
  const history = /** @type {Record<string, any>} */ (value);
  if (history.kind !== "audit-history" || history.readOnlyEvidence !== true) {
    throw new TypeError("audit history must be read-only evidence.");
  }
  if (!Array.isArray(history.events) || history.events.length === 0) throw new TypeError("audit history requires events.");
  const sequences = history.events.map((event) => event.sequence);
  const gaps = sequences.slice(1).filter((sequence, index) => sequence !== sequences[index] + 1).length;
  if (history.sequence.first !== sequences[0] || history.sequence.last !== sequences.at(-1) || history.sequence.gaps !== gaps) {
    throw new TypeError("audit history sequence metadata is inconsistent.");
  }
  if (!Array.isArray(history.allowedActions)) throw new TypeError("audit.allowedActions must be an array.");
  history.allowedActions.forEach((action, index) => assertAllowedAction(action, `audit.allowedActions[${index}]`));
}

export {};
