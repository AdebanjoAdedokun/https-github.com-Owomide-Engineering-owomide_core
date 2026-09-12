import { ArrowLeft, ArrowRight, Info, ShieldWarning } from "@phosphor-icons/react";
import "./journey-guidance.css";

/** A revision always names the retained source; navigation never rewrites it. */
export function RevisionContext({ origin, currentProposalRef, onNavigate }) {
  if (!origin?.sourceProposalRef) return null;
  const sourceRef = origin.sourceProposalRef;
  const ref = currentProposalRef ?? sourceRef;
  const hasReplacement = ref.id === sourceRef.id && ref.version !== sourceRef.version;
  return <section className="revision-context" aria-label="Pricing revision context">
    <div><small>Pricing revision · from Proposal v{sourceRef.version}</small><strong>{hasReplacement ? "Replacement draft prepared for fresh review." : "Update the evidence, then return for fresh review."}</strong>
      {origin.returnDecision?.reason ? <p>{origin.returnDecision.reason}</p> : null}
      <span>{hasReplacement ? `The earlier decision is retained. Continue with Proposal v${ref.version}.` : "The earlier proposal stays unchanged until you create a replacement draft."}</span>
    </div>
    <button type="button" className="secondary-action" onClick={() => onNavigate({ surface: "proposal", resourceId: ref.id, resourceVersion: ref.version, view: "overview" })}><ArrowLeft aria-hidden="true" />{hasReplacement ? "Open replacement" : "Back to proposal"}</button>
  </section>;
}

export function ProposalNextStep({ proposal, action, copy, canPrepare, restricted, handoffRequired, busy, onAction, onNavigate }) {
  // Required handoffs have immediately visible submission controls below.
  if (handoffRequired) return null;
  const blocked = proposal.state === "blocked" && proposal.override?.state !== "pending";
  const corrections = (proposal.blockers?.staleCost ?? 0) + (proposal.blockers?.dimension ?? 0);
  const exceptions = proposal.blockers?.margin ?? 0;
  const reviewSource = () => onNavigate({ surface: "repricing", resourceId: proposal.sourcePreviewRef.id, resourceVersion: proposal.sourcePreviewRef.version, view: "preview" });
  const returned = proposal.returnDecision && !proposal.returnDecision.addressedAt;
  const title = restricted ? "Read-only proposal" : blocked ? "Resolve the remaining issues" : returned ? "Review the requested changes before resubmitting" : copy.title;
  const detail = restricted ? "You can inspect prices and progress. Costs and internal discussion are restricted."
    : blocked ? [corrections ? `${corrections} source or scope issues need correction in Preview.` : null, exceptions ? `${exceptions} margin exceptions need an independent decision.` : null].filter(Boolean).join(" ")
      : returned ? "Revise pricing below if the decision needs new prices. A title-only correction keeps the existing pricing evidence." : copy.detail;
  return <section className={`proposal-next-step${blocked && !restricted ? " needs-attention" : ""}`} aria-label="Proposal next step">
    {blocked && !restricted ? <ShieldWarning aria-hidden="true" /> : <Info aria-hidden="true" />}
    <div className="proposal-next-step__copy"><h2>{title}</h2><p>{detail}</p>
      {!restricted && !action?.enabled && !canPrepare && action?.reason?.message ? <small>{action.reason.message}</small> : null}
    </div>
    {!restricted ? <div className="proposal-next-step__actions">
      {blocked && corrections > 0 && canPrepare ? <button className="primary-action" type="button" onClick={reviewSource}>Review source issues<ArrowRight aria-hidden="true" /></button> : null}
      {action?.enabled ? <button className={blocked && corrections > 0 && canPrepare ? "secondary-action" : "primary-action"} type="button" disabled={busy} onClick={() => onAction(action.code)}>{copy.label}<ArrowRight aria-hidden="true" /></button> : null}
    </div> : null}
  </section>;
}
