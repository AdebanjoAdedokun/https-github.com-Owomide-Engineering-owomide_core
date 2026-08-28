import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  ChartLineUp,
  ChatCenteredDots,
  CheckCircle,
  ClockCounterClockwise,
  Database,
  FileText,
  GitBranch,
  Info,
  LockKey,
  PaperPlaneTilt,
  SealCheck,
  ShieldCheck,
  ShieldWarning,
  Storefront,
  UserCheck,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { findAllowedAction } from "./data/contracts.js";
import { toDomainErrorEnvelope } from "./data/domainError.js";
import {
  formatBasisPoints,
  formatEffectiveAt,
  formatRecordedAt,
  formatRelativeTime,
  formatMoney,
  formatSignedMoney,
  initials,
  shortActorName,
} from "./workspacePresenter.js";

const PROPOSAL_VIEWS = ["overview", "lines", "margin", "comments", "activity"];

function statePresentation(proposal) {
  if (proposal.state === "approved") return { label: "Approved", tone: "approved", detail: "Ready for separate publication" };
  if (proposal.state === "submitted") return { label: "Submitted", tone: "submitted", detail: "Awaiting independent review" };
  if (proposal.state === "draft" && proposal.readiness === "ready_to_submit") return { label: "Ready", tone: "ready", detail: "All blockers reconciled" };
  if (proposal.override?.state === "pending") return { label: "Review requested", tone: "pending", detail: "Independent exception decision pending" };
  return { label: "Blocked", tone: "blocked", detail: `${proposal.counts.blocked} decisions require authority` };
}

function journeyStates(proposal, publication) {
  if (publication?.state === "published") return ["complete", "complete", "complete", "complete"];
  if (publication) return ["complete", "complete", "complete", "current"];
  if (proposal.state === "approved") return ["complete", "complete", "current", "future"];
  if (proposal.state === "submitted" || proposal.override?.state === "pending") return ["complete", "current", "future", "future"];
  return ["current", "future", "future", "future"];
}

function AuthorityJourney({ proposal, publication }) {
  const states = journeyStates(proposal, publication);
  const stages = [
    ["Proposal", proposal.ref.version ? `Version ${proposal.ref.version}` : "Current version", FileText],
    ["Independent review", proposal.approval ? shortActorName(proposal.approval.actor.displayName) : shortActorName(proposal.assignedApprover.displayName), UserCheck],
    ["Publication", publication ? `Operation v${publication.ref.version}` : shortActorName(proposal.assignedPublisher.displayName), PaperPlaneTilt],
    ["Reconciliation", publication?.state === "published" ? "Evidence confirmed" : "System outcome", SealCheck],
  ];
  return <ol className="proposal-journey" aria-label="Proposal authority journey">
    {stages.map(([label, detail, Icon], index) => {
      const state = states[index];
      return <li className={`is-${state}`} key={label} aria-current={state === "current" ? "step" : undefined}>
        <span className="proposal-journey__node"><Icon aria-hidden="true" /></span>
        <span><small>{String(index + 1).padStart(2, "0")}</small><strong>{label}</strong><em>{detail}</em></span>
      </li>;
    })}
  </ol>;
}

function routePrerequisites(kind, proposal) {
  const versionAvailable = Boolean(proposal.ref?.version);
  const assignedApprover = Boolean(proposal.assignedApprover?.id);
  const assignedPublisher = Boolean(proposal.assignedPublisher?.id);
  if (kind === "approval") return [
    { label: "Exact Proposal version", detail: versionAvailable ? `Version ${proposal.ref.version} is loaded` : "A version-bound Proposal is required", met: versionAvailable },
    { label: "Policy exceptions reconciled", detail: `${proposal.counts?.blocked ?? 0} decisions currently require authority`, met: Number(proposal.counts?.blocked ?? 0) === 0 },
    { label: "Independent review state", detail: `Current state: ${proposal.state.replaceAll("_", " ")}`, met: proposal.state === "submitted" && proposal.readiness === "awaiting_approval" },
    { label: "Assigned reviewer", detail: shortActorName(proposal.assignedApprover?.displayName ?? "Unassigned"), met: assignedApprover },
  ];
  if (kind === "publication") return [
    { label: "Exact Proposal version", detail: versionAvailable ? `Version ${proposal.ref.version} is loaded` : "A version-bound Proposal is required", met: versionAvailable },
    { label: "Independent approval recorded", detail: `Current state: ${proposal.state.replaceAll("_", " ")}`, met: proposal.state === "approved" },
    { label: "Publication readiness", detail: `Current readiness: ${proposal.readiness.replaceAll("_", " ")}`, met: proposal.readiness === "approved_to_publish" },
    { label: "Assigned publisher", detail: shortActorName(proposal.assignedPublisher?.displayName ?? "Unassigned"), met: assignedPublisher },
  ];
  return [];
}

function RouteStateBoundary({ eyebrow, title, detail, proposal, onNavigate, kind }) {
  const prerequisites = routePrerequisites(kind, proposal);
  return <section className="proposal-route-boundary" role="alert">
    <header><span><LockKey aria-hidden="true" /></span><div><small>{eyebrow}</small><h1>{title}</h1><p>{detail}</p></div></header>
    {prerequisites.length ? <div className="proposal-route-boundary__checklist" aria-label="Authority prerequisites"><small>Authority prerequisites</small>{prerequisites.map((item) => <div className={item.met ? "is-complete" : "is-pending"} key={item.label}>{item.met ? <ShieldCheck aria-hidden="true" /> : <LockKey aria-hidden="true" />}<span><strong>{item.label}</strong><small>{item.detail}</small></span></div>)}</div> : null}
    <button type="button" className="secondary-action" onClick={() => onNavigate({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: "overview" })}><ArrowLeft aria-hidden="true" /> Return to Proposal</button>
  </section>;
}

function DecisionDialog({ action, onClose, onConfirm, busy, error }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const capturesException = action.code === "override.request";
  const requestValid = !capturesException || (reason.trim().length >= 20 && evidence.trim().length >= 3);

  useEffect(() => {
    setReason("");
    setEvidence("");
  }, [action.code]);

  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  }, [busy, onClose]);

  useEffect(() => {
    const restore = document.activeElement;
    const app = document.querySelector(".workspace-app");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    app?.setAttribute("inert", "");
    closeRef.current?.focus();

    const onKey = (event) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      app?.removeAttribute("inert");
      restore?.focus?.();
    };
  }, []);

  const dialog = <div className="decision-dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialogRef} className="decision-dialog" role="dialog" aria-modal="true" aria-labelledby="decision-dialog-title" aria-describedby="decision-dialog-body" aria-busy={busy}>
      <header>
        <span><small>{action.eyebrow}</small><h2 id="decision-dialog-title">{action.title}</h2></span>
        <button ref={closeRef} type="button" className="icon-control" onClick={onClose} disabled={busy} aria-label="Close confirmation"><X aria-hidden="true" /></button>
      </header>
      <div className={`decision-dialog__consequence is-${action.tone ?? "authority"}`}>
        {action.tone === "write" || action.tone === "denial" ? <WarningCircle aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
        <p id="decision-dialog-body"><strong>{action.boundaryTitle}</strong><span>{action.body}</span></p>
      </div>
      {action.detail ? <p className="decision-dialog__detail">{action.detail}</p> : null}
      {capturesException ? <div className="decision-dialog__fields">
        <label htmlFor="exception-reason"><span>Business reason</span><textarea id="exception-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength="500" disabled={busy} placeholder="Explain why these margin decisions should proceed outside the current floor." /></label>
        <label htmlFor="exception-evidence"><span>Evidence reference</span><input id="exception-evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength="160" disabled={busy} placeholder="Document, ticket or source reference" /></label>
        <small>{reason.trim().length < 20 ? "Add a specific reason of at least 20 characters." : "The reason and evidence remain bound to this Proposal version."}</small>
      </div> : null}
      {error ? <div className="decision-dialog__error" role="alert"><ShieldWarning aria-hidden="true" />{error}</div> : null}
      <footer>
        <button type="button" className="secondary-action" onClick={onClose} disabled={busy}>{action.cancelLabel ?? "Return to review"}</button>
        <button type="button" className="primary-action" onClick={() => onConfirm(capturesException ? { reason: reason.trim(), evidence: evidence.trim() } : undefined)} disabled={busy || !requestValid}><span>{busy ? action.busyLabel : action.confirmLabel}</span><ArrowRight aria-hidden="true" /></button>
      </footer>
    </section>
  </div>;
  return createPortal(dialog, document.body);
}

function ProposalAnchor({ line, timezone, ruleLabel, compact = false }) {
  if (!line) return null;
  const floorBasisPoints = line.policy?.floorBasisPoints;
  const hasMargin = Number.isFinite(line.proposedMarginBasisPoints) && Number.isFinite(floorBasisPoints);
  const gapBasisPoints = hasMargin ? floorBasisPoints - line.proposedMarginBasisPoints : null;
  const policyClear = line.policy?.result === "clear";
  const belowFloor = !policyClear && gapBasisPoints > 0;
  const appliedPolicy = line.policy?.evaluation?.appliedRule ?? null;
  const issue = line.issue ?? line.policy?.violation ?? null;
  const policyPosition = gapBasisPoints === null
    ? (issue?.message ?? (line.policy?.result === "not-applicable" ? "Policy not evaluated" : "Policy review required"))
    : gapBasisPoints === 0
      ? "At policy floor"
      : `${(Math.abs(gapBasisPoints) / 100).toFixed(2)} pp ${gapBasisPoints > 0 ? "below" : "above"} policy`;
  const statusLabel = policyClear ? "Policy clear" : belowFloor ? "Below floor" : issue?.kind === "stale-cost" ? "Stale cost" : issue?.kind === "dimension" ? "Scope mismatch" : "Review required";
  const evidenceLabel = appliedPolicy
    ? `${appliedPolicy.name} · v${appliedPolicy.version} · ${appliedPolicy.scope}`
    : (line.policy?.evaluation?.explanation ?? "No applied margin policy");
  return <section className={`proposal-anchor${compact ? " is-compact" : ""}${policyClear ? " is-policy-clear" : " is-policy-blocked"}`} aria-label={`Financial consequence for ${line.product?.name ?? line.sku}`}>
    <header>
      <span><small>Anchor decision</small><strong>{line.product?.name ?? "Unresolved product"}</strong><em>{line.product?.variant ?? "Variant unavailable"} · {line.sku}</em></span>
      <span className="proposal-anchor__status">{policyClear ? <ShieldCheck aria-hidden="true" /> : <ShieldWarning aria-hidden="true" />} {statusLabel}</span>
    </header>
    <div className="proposal-anchor__prices">
      <span><small>Current price</small><strong>{formatMoney(line.currentPrice)}</strong><em>{formatBasisPoints(line.currentMarginBasisPoints)} margin</em></span>
      <span className="proposal-anchor__delta"><b>{ruleLabel}</b><i aria-hidden="true" /><em>{formatSignedMoney(line.absoluteDelta)}</em></span>
      <span><small>Proposed price</small><strong>{formatMoney(line.proposedPrice)}</strong><em>{formatBasisPoints(line.proposedMarginBasisPoints)} margin</em></span>
      <span className="proposal-anchor__floor"><small>Applied floor</small><strong>{formatBasisPoints(floorBasisPoints)}</strong><em>{line.policy?.floorPrice ? `${formatMoney(line.policy.floorPrice)} required` : "Not evaluated"}</em></span>
    </div>
    <footer>{policyClear ? <ShieldCheck aria-hidden="true" /> : <ShieldWarning aria-hidden="true" />}<span><strong>{policyPosition}</strong><small>{evidenceLabel} · source row {line.provenance?.rowNumber ?? "unavailable"} · Catalog v{line.provenance?.catalogVersion ?? "unavailable"} · effective {formatEffectiveAt(line.effectiveAt, timezone)}</small></span></footer>
  </section>;
}

function ReconciliationStrip({ proposal }) {
  const clearedLabel = proposal.blockers.total === 0 ? "Cleared to proceed" : "Policy clear";
  return <div className="proposal-reconciliation" aria-label="Proposal population reconciliation">
    <span><small>Selected</small><strong>{proposal.counts.selected.toLocaleString("en-NG")}</strong></span>
    <i aria-hidden="true">=</i>
    <span><small>{clearedLabel}</small><strong>{proposal.counts.eligible.toLocaleString("en-NG")}</strong></span>
    <i aria-hidden="true">+</i>
    <span className={proposal.counts.blocked ? "is-blocked" : "is-clear"}><small>{proposal.counts.blocked ? "Requiring authority" : "Unresolved"}</small><strong>{proposal.counts.blocked.toLocaleString("en-NG")}</strong></span>
  </div>;
}

function nextActionFor(proposal, publication) {
  if (publication?.state === "unknown-outcome") return findAllowedAction(publication.allowedActions, "publication.reconcile");
  if (publication?.state === "incomplete") return findAllowedAction(publication.allowedActions, "publication.retry_remaining") ?? findAllowedAction(publication.allowedActions, "publication.retry");
  if (publication?.state === "reconciling") return findAllowedAction(publication.allowedActions, "publication.reconcile");
  if (publication?.state === "published") return findAllowedAction(publication.allowedActions, "audit.read");
  if (proposal.override?.state === "pending") {
    const actions = proposal.override.allowedActions?.length ? proposal.override.allowedActions : proposal.allowedActions;
    const approve = findAllowedAction(actions, "override.approve");
    const deny = findAllowedAction(actions, "override.deny");
    return approve?.enabled ? approve : deny?.enabled ? deny : approve ?? deny;
  }
  if (proposal.state === "blocked") return findAllowedAction(proposal.allowedActions, "override.request");
  if (proposal.state === "draft" && proposal.readiness === "ready_to_submit") return findAllowedAction(proposal.allowedActions, "proposal.submit");
  if (proposal.state === "submitted") return findAllowedAction(proposal.allowedActions, "proposal.approve");
  if (proposal.state === "approved") return findAllowedAction(proposal.allowedActions, "proposal.publish") ?? findAllowedAction(proposal.allowedActions, "publication.start");
  return null;
}

function actionCopy(proposal, publication, action) {
  const remaining = publication?.counts.remaining.toLocaleString("en-NG");
  if (publication?.state === "unknown-outcome") return { title: "Outcome not yet confirmed", detail: "Check the existing operation before another release is attempted.", label: "Check operation status" };
  if (publication?.state === "incomplete") return { title: `${remaining} Catalog writes remain`, detail: "Only the unresolved rows can be retried with the original operation lineage.", label: `Retry ${remaining} unresolved lines` };
  if (publication?.state === "reconciling") return { title: `${remaining}-line retry is reconciling`, detail: "Check the existing operation for the durable Catalog result.", label: "Check reconciled result" };
  if (publication?.state === "published") return { title: "Catalog evidence reconciled", detail: "The authorised Proposal and the applied outcome now match.", label: "View audit trail" };
  if (proposal.override?.state === "pending") return { title: "Review exception", detail: `${shortActorName(proposal.assignedApprover.displayName)} is assigned to decide.`, label: "Review exception" };
  if (proposal.state === "blocked") return { title: `${proposal.counts.blocked} decisions need authority`, detail: "Resolve all exceptions to continue.", label: "Request exception review" };
  if (proposal.state === "draft") return { title: "Current version is ready", detail: "Submission locks this version for an independent Proposal decision.", label: "Submit for independent review" };
  if (proposal.state === "submitted") return { title: "Independent Proposal decision", detail: `${shortActorName(proposal.assignedApprover.displayName)} can decide the current submitted version.`, label: "Review current version" };
  if (proposal.state === "approved") return { title: "Approved, not published", detail: `${shortActorName(proposal.assignedPublisher.displayName)} must separately authorise the Catalog write.`, label: "Review publication" };
  return { title: "No mutation available", detail: action?.reason?.message ?? "The current object state has no permitted action.", label: "Unavailable" };
}

function AuthorityRail({ proposal, publication, session, onAction, panelRef, onClose }) {
  const action = nextActionFor(proposal, publication);
  const copy = actionCopy(proposal, publication, action);
  return <aside
    ref={panelRef}
    className="proposal-authority"
    id="proposal-authority-panel"
    aria-label="Current authority"
    tabIndex="-1"
    onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }}
  >
    <div className="proposal-authority__controls">
      <button type="button" className="proposal-authority__back" onClick={onClose}><ArrowLeft aria-hidden="true" /> Back to Proposal</button>
      <button type="button" className="icon-control" onClick={onClose} aria-label="Close current authority"><X aria-hidden="true" /></button>
    </div>
    <header><small>Next action</small><h2>{copy.title}</h2><p>{copy.detail}</p></header>
    <div className="proposal-authority__actor">
      <span className="avatar">{initials(session.actor.displayName)}</span>
      <span><small>Current session</small><strong>{shortActorName(session.actor.displayName)}</strong><em>{session.roleCodes.join(" · ").replaceAll("_", " ")}</em></span>
    </div>
    {action?.enabled ? <button type="button" className="primary-action proposal-authority__action" onClick={() => onAction(action.code)}><span>{copy.label}</span><ArrowRight aria-hidden="true" /></button> : <div className="proposal-authority__denial"><LockKey aria-hidden="true" /><span><strong>{action?.reason?.message ?? copy.title}</strong><small>Your review position and object context remain preserved.</small></span></div>}
    <div className="proposal-authority__boundary"><ShieldCheck aria-hidden="true" /><span><strong>Authority stays separated</strong><small>Exception, approval and publication remain distinct server decisions.</small></span></div>
    <dl>
      <div><dt>Author</dt><dd>{shortActorName(proposal.author.displayName)}</dd></div>
      <div><dt>Approver</dt><dd>{shortActorName(proposal.assignedApprover.displayName)}</dd></div>
      <div><dt>Publisher</dt><dd>{shortActorName(proposal.assignedPublisher.displayName)}</dd></div>
      <div><dt>Source Preview</dt><dd>{proposal.sourcePreviewRef.id}</dd></div>
    </dl>
  </aside>;
}

function OverviewView({ proposal, anchorLine, timezone, ruleLabel }) {
  return <div className="proposal-overview">
    <ReconciliationStrip proposal={proposal} />
    <ProposalAnchor line={anchorLine} timezone={timezone} ruleLabel={ruleLabel} />
    <section className="proposal-evidence-grid">
      <article>
        <header><ShieldWarning aria-hidden="true" /><span><small>Policy reconciliation</small><strong>{proposal.blockers.total ? "Open decisions" : "Reconciled"}</strong></span></header>
        <dl>
          <div><dt>Margin floor</dt><dd>{proposal.blockers.margin}</dd></div>
          <div><dt>Stale cost</dt><dd>{proposal.blockers.staleCost}</dd></div>
          <div><dt>Dimension scope</dt><dd>{proposal.blockers.dimension}</dd></div>
        </dl>
      </article>
      <article>
        <header><GitBranch aria-hidden="true" /><span><small>Version lineage</small><strong>Evidence locked to v{proposal.ref.version}</strong></span></header>
        <dl>
          <div><dt>Preview</dt><dd>{proposal.sourcePreviewRef.version}</dd></div>
          <div><dt>Proposal</dt><dd>v{proposal.ref.version}</dd></div>
          <div><dt>Effective</dt><dd>{formatEffectiveAt(proposal.effectiveAt, timezone)}</dd></div>
        </dl>
      </article>
      {proposal.override ? <article className="proposal-override-record">
        <header><UserCheck aria-hidden="true" /><span><small>Exception request</small><strong>{proposal.override.state === "pending" ? "Independent decision pending" : "Different actor recorded"}</strong></span></header>
        <p>{proposal.override.reason}</p>
        <footer><span>{proposal.override.lineCount} lines</span><span>Expires {formatEffectiveAt(proposal.override.expiresAt, timezone)}</span></footer>
      </article> : null}
    </section>
  </div>;
}

function LinesView({ proposal, lines, timezone, ruleLabel }) {
  return <div className="proposal-lines-view">
    <div className="proposal-lines-view__note"><Info aria-hidden="true" /><span><strong>{lines.length} fixture lines shown</strong><small>The authoritative Proposal retains all {proposal.counts.selected.toLocaleString("en-NG")} selected line identities.</small></span></div>
    {lines.map((line) => <ProposalAnchor key={line.id} line={line} timezone={timezone} ruleLabel={ruleLabel} compact />)}
  </div>;
}

function ProposalViewState({ state, title, detail, onRetry }) {
  const failed = state === "error";
  return <section className={`proposal-view-state${failed ? " is-error" : ""}`} role={failed ? "alert" : "status"} aria-live="polite">
    <span>{failed ? <ShieldWarning aria-hidden="true" /> : <Database aria-hidden="true" />}</span>
    <small>{failed ? "Evidence unavailable" : "Resolving retained evidence"}</small>
    <strong>{title}</strong>
    <p>{detail}</p>
    {failed && onRetry ? <button type="button" className="secondary-action" onClick={onRetry}>Retry this view</button> : null}
  </section>;
}

function MarginView({ evidence, proposal, timezone, ruleLabel, onAction }) {
  const authorityAction = findAllowedAction(evidence.allowedActions, "override.request");
  const unresolved = evidence.counts.unresolved;
  const retained = evidence.counts.retained;
  return <section className="proposal-margin-view" aria-label="Retained margin evidence">
    <header className="proposal-margin-view__head">
      <span className="proposal-view-mark"><ChartLineUp aria-hidden="true" /></span>
      <span><small>Policy snapshot</small><h2>Margin evidence · v{evidence.proposalRef.version}</h2><p>Policy evidence saved with this Proposal.</p></span>
      <span className={`proposal-margin-view__state${unresolved ? " is-blocked" : " is-clear"}`}>{unresolved ? <ShieldWarning aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{unresolved ? `${unresolved} unresolved` : "Authority reconciled"}</span>
    </header>
    <dl className="proposal-margin-snapshot">
      <div><dt>Margin policy</dt><dd>{evidence.policySnapshot.label}</dd><small>v{evidence.policySnapshot.version}</small></div>
      <div><dt>Applicable floors</dt><dd>{formatBasisPoints(evidence.policySnapshot.floorRangeBasisPoints.minimum)}–{formatBasisPoints(evidence.policySnapshot.floorRangeBasisPoints.maximum)}</dd><small>{evidence.policySnapshot.effect}</small></div>
      <div><dt>Source Preview</dt><dd>{evidence.sourcePreviewRef.id}</dd><small>v{evidence.sourcePreviewRef.version}</small></div>
      <div><dt>Evaluated</dt><dd>{formatRecordedAt(evidence.evaluatedAt, timezone)}</dd><small>{retained} margin decisions retained</small></div>
    </dl>
    <section className={`proposal-margin-authority${authorityAction?.enabled ? " is-actionable" : ""}`}>
      <ShieldWarning aria-hidden="true" />
      <span><small>Explicit authority</small><strong>{authorityAction?.enabled ? `${retained} retained margin decisions require independent authority.` : (authorityAction?.reason?.message ?? "No margin authority action is available.")}</strong><p>Assigned reviewer: {shortActorName(proposal.assignedApprover.displayName)}. Approval and publication remain separate decisions.</p></span>
      {authorityAction?.enabled ? <button type="button" className="secondary-action" onClick={() => onAction(authorityAction.code)}>{authorityAction.confirmation?.confirmLabel ?? "Request independent review"}</button> : null}
    </section>
    <header className="proposal-margin-lines-head"><span><small>Line evidence</small><strong>{evidence.lines.length} bounded sample lines shown</strong></span><em>{retained} retained in the exact Proposal population</em></header>
    {evidence.lines.length ? <div className="proposal-margin-lines">
      {evidence.lines.map((line) => <ProposalAnchor key={line.id} line={line} timezone={timezone} ruleLabel={ruleLabel} compact />)}
    </div> : <div className="proposal-view-empty"><ChartLineUp aria-hidden="true" /><span><strong>No margin lines are available in this bounded fixture.</strong><small>The retained Proposal counts and version remain unchanged.</small></span></div>}
  </section>;
}

function CommentsView({ thread, proposal, session, timezone, body, onBodyChange, onSubmit, submitting, mutationError, loadingMore, loadMoreError, onLoadMore }) {
  const addAction = findAllowedAction(thread.allowedActions, "proposal.comment.add");
  const canSubmit = addAction?.enabled && body.trim() && !submitting;
  return <section className="proposal-comments-view" aria-label="Proposal comments">
    <header className="proposal-comments-view__head">
      <span className="proposal-view-mark"><ChatCenteredDots aria-hidden="true" /></span>
      <span><small>Comments · v{thread.proposalRef.version}</small><h2>Proposal discussion</h2><p>Comments stay with this version.</p></span>
      <strong>{thread.page.totalCount.toLocaleString("en-NG")}</strong>
    </header>
    {thread.items.length ? <ol className="proposal-comment-list">
      {thread.items.map((comment) => <li key={comment.ref.id}>
        <span className="avatar">{initials(comment.actor.displayName)}</span>
        <article>
          <header><span><strong>{shortActorName(comment.actor.displayName)}</strong><small>Human actor</small></span><time dateTime={comment.createdAt}>{formatRecordedAt(comment.createdAt, timezone)}</time></header>
          <p>{comment.body}</p>
          <footer><GitBranch aria-hidden="true" />Proposal v{comment.proposalRef.version}<span>Comment v{comment.ref.version}</span></footer>
        </article>
      </li>)}
    </ol> : <div className="proposal-view-empty"><ChatCenteredDots aria-hidden="true" /><span><strong>No comments have been recorded for Proposal v{proposal.ref.version}.</strong><small>Add the first version-bound note if the server action permits it.</small></span></div>}
    {loadMoreError ? <div className="proposal-comments-error" role="alert"><ShieldWarning aria-hidden="true" /><span>{loadMoreError}</span></div> : null}
    {thread.page.nextCursor ? <button type="button" className="secondary-action proposal-comments-more" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? "Loading comments…" : "Load earlier comments"}</button> : null}
    {addAction?.enabled ? <form className="proposal-comment-composer" onSubmit={onSubmit} aria-busy={submitting}>
      <header><span className="avatar">{initials(session.actor.displayName)}</span><span><small>Commenting as</small><strong>{shortActorName(session.actor.displayName)}</strong><em>Resolved session identity</em></span></header>
      <label htmlFor="proposal-comment-body">{addAction.confirmation?.title ?? "Add comment"}</label>
      {addAction.confirmation?.body ? <p>{addAction.confirmation.body}</p> : null}
      <textarea id="proposal-comment-body" value={body} onChange={(event) => onBodyChange(event.target.value)} maxLength="2000" placeholder="Record evidence, a question or the reason another actor should review this version." disabled={submitting} />
      <footer><span><small>{body.length.toLocaleString("en-NG")} / 2,000</small><em>Proposal {proposal.ref.id} · v{proposal.ref.version}</em></span><button type="submit" className="primary-action" disabled={!canSubmit}>{submitting ? "Recording comment…" : (addAction.confirmation?.confirmLabel ?? "Add comment")}</button></footer>
      {mutationError ? <div className="proposal-comments-error" role="alert"><ShieldWarning aria-hidden="true" /><span>{mutationError}</span></div> : null}
    </form> : <div className="proposal-comments-denial"><LockKey aria-hidden="true" /><span><strong>{addAction?.reason?.message ?? "Adding comments is not available for this session."}</strong><small>The existing version-bound discussion remains readable.</small></span></div>}
  </section>;
}

function ActivityView({ audit, timezone, permitted }) {
  const events = audit?.events ?? [];
  return <div className="proposal-activity">
    <header><ClockCounterClockwise aria-hidden="true" /><span><strong>Audit trail</strong><small>{events.length ? `${events.length} sequenced events · ${audit.sequence.gaps} gaps` : permitted ? "Evidence is resolving" : "Audit permission is required"}</small></span></header>
    {!events.length && !permitted ? <div className="proposal-activity__boundary"><LockKey aria-hidden="true" /><span><strong>This session cannot read the audit ledger.</strong><small>The Proposal remains visible. Audit evidence is exposed only to authorised participants and auditors.</small></span></div> : null}
    <ol>
      {events.slice().reverse().map((event) => <li key={event.id}>
        <span className="proposal-activity__sequence">{String(event.sequence).padStart(2, "0")}</span>
        <span><strong>{event.eventType.replaceAll(".", " ")}</strong><small>{event.reason}</small></span>
        <time dateTime={event.occurredAt}><span>{formatRecordedAt(event.occurredAt, timezone)}</span><small>{formatRelativeTime(event.occurredAt)}</small></time>
      </li>)}
    </ol>
  </div>;
}

function ReviewDocument({ proposal, anchorLine, session, timezone, ruleLabel, mode, actions, onConfirm }) {
  const isOverride = mode === "override";
  const differentActor = proposal.author.id !== session.actor.id;
  const title = isOverride ? "Review protected exception" : "Review the current version";
  const approveAction = actions?.approve ?? null;
  const denyAction = actions?.deny ?? null;
  const denialAction = approveAction ?? denyAction;
  return <section className="review-document" aria-label={title}>
    <header className="review-document__head">
      <small>Independent review</small>
      <h1>{title}</h1>
      <p>Confirm the people, scope, evidence and commercial consequence before recording authority.</p>
    </header>
    <div className="review-document__boundary"><ShieldCheck aria-hidden="true" /><span><strong>Approval does not publish</strong><small>Catalog prices remain unchanged until a separate Publisher releases this exact version.</small></span></div>
    <div className="review-document__grid">
      <section>
        <span className="review-section-number">01</span>
        <div><small>People and authority</small><h2>Different actors, explicit responsibility.</h2>
          <dl className="review-people"><div><dt>Author</dt><dd>{shortActorName(proposal.author.displayName)}</dd></div><div><dt>Reviewer</dt><dd>{shortActorName(session.actor.displayName)}</dd></div><div><dt>Separation</dt><dd className={differentActor ? "is-valid" : "is-invalid"}>{differentActor ? "Confirmed" : "Required"}</dd></div></dl>
        </div>
      </section>
      <section>
        <span className="review-section-number">02</span>
        <div><small>Scope and consequence</small><h2>{proposal.counts.selected.toLocaleString("en-NG")} selected lines stay intact.</h2><ProposalAnchor line={anchorLine} timezone={timezone} ruleLabel={ruleLabel} compact /></div>
      </section>
      <section>
        <span className="review-section-number">03</span>
        <div><small>Version integrity</small><h2>Reviewing Proposal v{proposal.ref.version}.</h2><dl className="review-version"><div><dt>Current version</dt><dd>{proposal.ref.version}</dd></div><div><dt>Source Preview</dt><dd>{proposal.sourcePreviewRef.version}</dd></div><div><dt>Effective</dt><dd>{formatEffectiveAt(proposal.effectiveAt, timezone)}</dd></div></dl></div>
      </section>
      <section>
        <span className="review-section-number">04</span>
        <div><small>Decision evidence</small><h2>{isOverride ? "A bounded request with evidence and expiry." : "A reconciled Proposal with no unresolved blockers."}</h2>{isOverride && proposal.override ? <div className="review-evidence"><p>{proposal.override.reason}</p><span><FileText aria-hidden="true" />{proposal.override.evidence}</span><span><ClockCounterClockwise aria-hidden="true" />Expires {formatEffectiveAt(proposal.override.expiresAt, timezone)}</span></div> : <div className="review-evidence"><p>All {proposal.counts.selected.toLocaleString("en-NG")} lines have been evaluated against the current source and policy snapshot.</p><span><ShieldCheck aria-hidden="true" />{proposal.counts.blocked} unresolved blockers</span></div>}</div>
      </section>
    </div>
    <footer className="review-document__actions">
      {isOverride && (approveAction?.enabled || denyAction?.enabled) ? <div className="proposal-decision-actions">
        {denyAction?.enabled ? <button type="button" className="secondary-action is-denial" onClick={() => onConfirm(denyAction.code)}><span>{denyAction.confirmation?.confirmLabel ?? "Deny exception"}</span></button> : null}
        {approveAction?.enabled ? <button type="button" className="primary-action" onClick={() => onConfirm(approveAction.code)}><span>{approveAction.confirmation?.confirmLabel ?? "Approve exception"}</span><ArrowRight aria-hidden="true" /></button> : null}
      </div> : !isOverride && approveAction?.enabled ? <button type="button" className="primary-action" onClick={() => onConfirm(approveAction.code)}><span>{approveAction.confirmation?.confirmLabel ?? "Approve current version"}</span><ArrowRight aria-hidden="true" /></button> : <div className="proposal-authority__denial"><LockKey aria-hidden="true" /><span><strong>{denialAction?.reason?.message ?? "This review cannot be recorded in the current session."}</strong><small>Work and review position remain preserved.</small></span></div>}
    </footer>
  </section>;
}

function PublicationReview({ proposal, anchorLine, session, timezone, ruleLabel, action, onConfirm }) {
  return <section className="review-document publication-review" aria-label="Publication review">
    <header className="review-document__head"><small>Publication review</small><h1>Release the approved version</h1><p>Reconfirm the approved scope, effective time and authority before starting the Catalog write.</p></header>
    <div className="review-document__boundary is-write"><WarningCircle aria-hidden="true" /><span><strong>This action changes Catalog prices</strong><small>The release starts a durable operation. Success appears only after every intended write reconciles.</small></span></div>
    <div className="publication-manifest">
      <header><span><small>Release manifest</small><strong>Proposal v{proposal.ref.version}</strong></span><span className="proposal-state is-approved"><SealCheck aria-hidden="true" /> Approved</span></header>
      <ReconciliationStrip proposal={proposal} />
      <dl>
        <div><dt>Publisher</dt><dd>{shortActorName(session.actor.displayName)}</dd></div>
        <div><dt>Approved by</dt><dd>{shortActorName(proposal.approval?.actor.displayName ?? proposal.assignedApprover.displayName)}</dd></div>
        <div><dt>Effective time</dt><dd>{formatEffectiveAt(proposal.effectiveAt, timezone)}</dd></div>
      </dl>
      <ProposalAnchor line={anchorLine} timezone={timezone} ruleLabel={ruleLabel} compact />
    </div>
    <footer className="review-document__actions">
      {action?.enabled ? <button type="button" className="primary-action" onClick={onConfirm}><span>Start publication</span><ArrowRight aria-hidden="true" /></button> : <div className="proposal-authority__denial"><LockKey aria-hidden="true" /><span><strong>{action?.reason?.message ?? "Publication is not available in this session."}</strong><small>The approved Proposal remains unchanged.</small></span></div>}
    </footer>
  </section>;
}

function PublicationStatus({ proposal, publication, audit, timezone, onAction }) {
  const published = publication.state === "published";
  const incomplete = publication.state === "incomplete";
  const unknown = publication.state === "unknown-outcome";
  const reconciling = publication.state === "reconciling";
  const remaining = publication.counts.remaining.toLocaleString("en-NG");
  const action = nextActionFor(proposal, publication);
  return <section className={`publication-operation is-${publication.state}`} aria-label="Publication operation" data-authoritative-result tabIndex="-1">
    <header>
      <span className="publication-operation__mark">{published ? <SealCheck aria-hidden="true" /> : unknown || reconciling ? <ClockCounterClockwise aria-hidden="true" /> : <WarningCircle aria-hidden="true" />}</span>
      <span><small>Publication operation · v{publication.ref.version}</small><h1>{published ? "Published and reconciled" : incomplete ? "Publication incomplete" : reconciling ? "Retry is reconciling" : "Outcome not yet confirmed"}</h1><p>{published ? "Catalog evidence matches this Proposal version." : incomplete ? `${remaining} Catalog writes require a bounded recovery.` : reconciling ? `Only the ${remaining} unresolved writes are being checked against the original operation.` : "Do not start another release while this operation is unresolved."}</p></span>
    </header>
    <div className="publication-counts">
      <span><small>Requested</small><strong>{publication.counts.requested.toLocaleString("en-NG")}</strong></span>
      <span className={unknown ? "is-unconfirmed" : ""}><small>Applied</small><strong>{unknown ? "Unconfirmed" : publication.counts.succeeded.toLocaleString("en-NG")}</strong></span>
      <span className={unknown ? "is-unconfirmed" : publication.counts.remaining ? "is-warning" : "is-clear"}><small>Remaining</small><strong>{unknown ? "Unconfirmed" : publication.counts.remaining}</strong></span>
      <span><small>Duplicate writes</small><strong>{publication.counts.duplicateWrites}</strong></span>
    </div>
    <div className="publication-proof">
      <div><Database aria-hidden="true" /><span><small>Operation ID</small><strong>{publication.ref.id}</strong></span></div>
      <div><GitBranch aria-hidden="true" /><span><small>Proposal lineage</small><strong>{proposal.ref.id} · v{proposal.ref.version}</strong></span></div>
      <div><PaperPlaneTilt aria-hidden="true" /><span><small>Publisher</small><strong>{shortActorName(publication.publisher.displayName)}</strong></span></div>
      {publication.supportId ? <div><Info aria-hidden="true" /><span><small>Support ID</small><strong>{publication.supportId}</strong></span></div> : null}
    </div>
    {incomplete ? <section className="publication-recovery"><header><ShieldWarning aria-hidden="true" /><span><small>Recovery scope</small><strong>Only {publication.counts.remaining.toLocaleString("en-NG")} unresolved writes can be retried.</strong></span></header><div><span>Catalog rows</span><strong>{publication.counts.remaining.toLocaleString("en-NG")}</strong><em>Original operation lineage retained</em></div></section> : null}
    <footer>
      {action?.enabled ? <button type="button" className="primary-action" onClick={() => onAction(action.code)}><span>{unknown ? "Check operation status" : reconciling ? "Check reconciled result" : `Retry ${publication.counts.remaining} unresolved lines`}</span><ArrowRight aria-hidden="true" /></button> : published && audit ? <button type="button" className="secondary-action" onClick={() => onAction("audit.read")}><span>View audit trail</span><ArrowRight aria-hidden="true" /></button> : <div className="proposal-authority__denial"><LockKey aria-hidden="true" /><span><strong>{published ? "Published evidence is settled." : (action?.reason?.message ?? "No protected action is currently permitted.")}</strong><small>{published ? "An authorised audit session can reconstruct the full lineage." : "The existing operation remains the authority."}</small></span></div>}
    </footer>
  </section>;
}

function serverActionFor(code, proposal, publication) {
  if (!code) return null;
  if (code === "override.approve" || code === "override.deny") return findAllowedAction(proposal.override?.allowedActions ?? [], code) ?? findAllowedAction(proposal.allowedActions, code);
  if (code === "publication.start") return findAllowedAction(proposal.allowedActions, code);
  if (code.startsWith("publication.")) return findAllowedAction(publication?.allowedActions ?? [], code);
  return findAllowedAction(proposal.allowedActions, code);
}

function proposalConfirmation(code, proposal, publication) {
  const serverAction = serverActionFor(code, proposal, publication);
  const confirmation = serverAction?.confirmation;
  const withServerCopy = (defaults) => ({
    ...defaults,
    code,
    title: confirmation?.title ?? defaults.title,
    body: confirmation?.body ?? defaults.body,
    confirmLabel: confirmation?.confirmLabel ?? defaults.confirmLabel,
  });
  if (code === "override.request") return withServerCopy({ eyebrow: "Exception request", title: "Request independent exception review?", boundaryTitle: "The Proposal remains blocked", body: `This requests authority for ${proposal.blockers.margin} margin decisions. It does not approve or publish a price.`, confirmLabel: "Request independent review", busyLabel: "Requesting review…" });
  if (code === "override.approve") return withServerCopy({ eyebrow: "Independent review", title: "Approve the protected exception?", boundaryTitle: "Proposal approval still remains separate", body: "This records a different actor’s exception decision and triggers authoritative re-evaluation. It does not approve the Proposal.", confirmLabel: "Approve exception and re-evaluate", busyLabel: "Recording decision…" });
  if (code === "override.deny") return withServerCopy({ eyebrow: "Independent review", title: "Deny the protected exception?", boundaryTitle: "The Proposal remains blocked", body: "This records a different actor’s denial. No price is approved or published, and the evidenced lines remain blocked.", confirmLabel: "Deny exception", busyLabel: "Recording denial…", tone: "denial" });
  if (code === "proposal.submit") return withServerCopy({ eyebrow: "Submit Proposal", title: "Lock and submit the current version?", boundaryTitle: "Independent review becomes required", body: `Proposal v${proposal.ref.version} will be locked for the assigned Approver. Catalog remains unchanged.`, confirmLabel: "Submit current version", busyLabel: "Submitting…" });
  if (code === "proposal.approve") return withServerCopy({ eyebrow: "Independent review", title: "Approve current version?", boundaryTitle: "Approval does not publish", body: "This records independent authority for the reviewed version. Catalog prices remain unchanged.", confirmLabel: "Approve current version", busyLabel: "Recording approval…" });
  if (code === "publication.start") return withServerCopy({ eyebrow: "Publication authority", title: "Start publication?", boundaryTitle: "This action changes Catalog prices", body: `This requests ${proposal.counts.selected.toLocaleString("en-NG")} Catalog writes for the approved current version.`, confirmLabel: "Start publication", busyLabel: "Starting operation…", tone: "write" });
  if (code === "publication.retry") return withServerCopy({ eyebrow: "Bounded recovery", title: `Retry ${publication.counts.remaining} unresolved lines?`, boundaryTitle: "Only unresolved writes will be retried", body: "The original operation and idempotency lineage remain authoritative. Successful writes are not repeated.", confirmLabel: `Retry ${publication.counts.remaining} lines`, busyLabel: "Retrying unresolved lines…", tone: "write" });
  return null;
}

export function ProposalWorkspace({
  route,
  proposal,
  publication,
  audit,
  previewLines,
  proposalRepository,
  ruleLabel = "+3.50%",
  session,
  busy,
  error,
  onNavigate,
  onPerformAction,
}) {
  const [dialogAction, setDialogAction] = useState(null);
  const [authorityOpen, setAuthorityOpen] = useState(false);
  const [marginState, setMarginState] = useState({ status: "idle", data: null, error: null });
  const [commentsState, setCommentsState] = useState({ status: "idle", data: null, error: null });
  const [marginRetry, setMarginRetry] = useState(0);
  const [commentsRetry, setCommentsRetry] = useState(0);
  const [commentBody, setCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentMutationError, setCommentMutationError] = useState(null);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [commentsLoadMoreError, setCommentsLoadMoreError] = useState(null);
  const authorityTriggerRef = useRef(null);
  const authorityRailRef = useRef(null);
  const tabsRef = useRef(null);
  const commentIdempotencyRef = useRef(null);
  const commentsScopeKey = `${proposal.ref.id}:v${proposal.ref.version}:${session.actor.id}`;
  const commentsScopeRef = useRef(commentsScopeKey);
  commentsScopeRef.current = commentsScopeKey;
  const anchorLine = previewLines.find((line) => line.sku === "KLD-PANT-0032") ?? previewLines[0] ?? null;
  const timezone = session.organisation.timezone;
  const state = statePresentation(proposal);
  const view = PROPOSAL_VIEWS.includes(route.view) ? route.view : "overview";

  useEffect(() => {
    let current = true;
    if (view === "margin") {
      setMarginState({ status: "loading", data: null, error: null });
      Promise.resolve().then(() => proposalRepository.getMarginEvidence({ proposalRef: proposal.ref })).then((data) => {
        if (current) setMarginState({ status: "ready", data, error: null });
      }).catch((caught) => {
        if (!current) return;
        const envelope = toDomainErrorEnvelope(caught, "proposal-margin-load");
        setMarginState({ status: "error", data: null, error: envelope.error.message });
      });
    }
    if (view === "comments") {
      setCommentsState({ status: "loading", data: null, error: null });
      setCommentMutationError(null);
      setCommentsLoadMoreError(null);
      Promise.resolve().then(() => proposalRepository.listComments({ proposalRef: proposal.ref, limit: 5 })).then((data) => {
        if (current) setCommentsState({ status: "ready", data, error: null });
      }).catch((caught) => {
        if (!current) return;
        const envelope = toDomainErrorEnvelope(caught, "proposal-comments-load");
        setCommentsState({ status: "error", data: null, error: envelope.error.message });
      });
    }
    return () => { current = false; };
  }, [commentsRetry, marginRetry, proposal.ref.id, proposal.ref.version, proposalRepository, session.actor.id, view]);

  useEffect(() => {
    commentIdempotencyRef.current = null;
    setCommentBody("");
    setCommentSubmitting(false);
    setCommentMutationError(null);
    setCommentsLoadMoreError(null);
  }, [proposal.ref.id, proposal.ref.version, session.actor.id]);

  const closeAuthority = () => {
    setAuthorityOpen(false);
    window.requestAnimationFrame(() => authorityTriggerRef.current?.focus?.({ preventScroll: true }));
  };

  useEffect(() => {
    if (authorityOpen) authorityRailRef.current?.focus?.({ preventScroll: true });
  }, [authorityOpen]);

  useEffect(() => {
    setAuthorityOpen(false);
  }, [proposal.ref.id, proposal.ref.version, view]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const tabList = tabsRef.current;
      const selectedTab = tabList?.querySelector('[aria-selected="true"]');
      if (!tabList || !selectedTab) return;
      const inset = 12;
      const selectedLeft = selectedTab.offsetLeft;
      const selectedRight = selectedLeft + selectedTab.offsetWidth;
      if (selectedLeft < tabList.scrollLeft + inset) tabList.scrollLeft = Math.max(0, selectedLeft - inset);
      if (selectedRight > tabList.scrollLeft + tabList.clientWidth - inset) {
        tabList.scrollLeft = selectedRight - tabList.clientWidth + inset;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [commentsState.data?.page.totalCount, commentsState.status, view]);

  useEffect(() => {
    if (!busy && (proposal.ref.version || publication?.ref.version)) {
      document.querySelector("[data-authoritative-result]")?.focus?.({ preventScroll: true });
    }
  }, [busy, proposal.ref.version, publication?.ref.version]);

  const actionContext = useMemo(() => proposalConfirmation(dialogAction, proposal, publication), [dialogAction, proposal, publication]);
  const perform = async (input) => {
    if (!actionContext) return;
    const succeeded = await onPerformAction(actionContext.code, input);
    if (succeeded !== false) setDialogAction(null);
  };

  const onViewTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = PROPOSAL_VIEWS.indexOf(view);
    let next = current;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = PROPOSAL_VIEWS.length - 1;
    if (event.key === "ArrowRight") next = (current + 1) % PROPOSAL_VIEWS.length;
    if (event.key === "ArrowLeft") next = (current - 1 + PROPOSAL_VIEWS.length) % PROPOSAL_VIEWS.length;
    const nextView = PROPOSAL_VIEWS[next];
    onNavigate({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: nextView });
    window.requestAnimationFrame(() => document.getElementById(`proposal-tab-${nextView}`)?.focus());
  };

  const handleAction = (code) => {
    if (code === "override.approve" || code === "override.deny") {
      onNavigate({
        surface: "proposal-override",
        resourceId: proposal.ref.id,
        resourceVersion: proposal.ref.version,
        overrideId: proposal.override.ref.id,
        overrideVersion: proposal.override.ref.version,
        view: "review",
      });
      return;
    }
    if (code === "proposal.approve") {
      onNavigate({ surface: "proposal-approval", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: "review" });
      return;
    }
    if (code === "proposal.publish" || code === "publication.start") {
      onNavigate({ surface: "proposal-publish", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: "review" });
      return;
    }
    if (code === "publication.reconcile") {
      onPerformAction(code);
      return;
    }
    if (code === "audit.read") {
      onNavigate({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: "activity" });
      return;
    }
    setDialogAction(code);
  };

  const changeCommentBody = (value) => {
    if (value !== commentBody) commentIdempotencyRef.current = null;
    setCommentMutationError(null);
    setCommentBody(value);
  };

  const loadMoreComments = async () => {
    const thread = commentsState.data;
    if (!thread?.page.nextCursor || commentsLoadingMore) return;
    const requestScopeKey = commentsScopeKey;
    setCommentsLoadingMore(true);
    setCommentsLoadMoreError(null);
    try {
      const next = await proposalRepository.listComments({
        proposalRef: proposal.ref,
        cursor: thread.page.nextCursor,
        limit: thread.page.limit,
      });
      if (commentsScopeRef.current !== requestScopeKey) return;
      setCommentsState((current) => {
        if (current.status !== "ready" || !current.data) return current;
        const known = new Set(current.data.items.map((comment) => comment.ref.id));
        const items = [...current.data.items, ...next.items.filter((comment) => !known.has(comment.ref.id))];
        return { status: "ready", error: null, data: { ...next, items, page: { ...next.page, returnedCount: items.length } } };
      });
    } catch (caught) {
      if (commentsScopeRef.current !== requestScopeKey) return;
      setCommentsLoadMoreError(toDomainErrorEnvelope(caught, "proposal-comments-page").error.message);
    } finally {
      if (commentsScopeRef.current === requestScopeKey) setCommentsLoadingMore(false);
    }
  };

  const submitComment = async (event) => {
    event.preventDefault();
    const thread = commentsState.data;
    const action = findAllowedAction(thread?.allowedActions ?? [], "proposal.comment.add");
    if (!action?.enabled) {
      setCommentMutationError(action?.reason?.message ?? "Adding a comment is not permitted for this Proposal version.");
      return;
    }
    if (action.requiredVersion !== proposal.ref.version) {
      setCommentMutationError("This Proposal changed after the comment action was resolved. Reload the current version before continuing.");
      return;
    }
    const body = commentBody.trim();
    if (!body) return;
    const idempotencyKey = commentIdempotencyRef.current
      ?? `proposal-comment:${proposal.ref.id}:v${proposal.ref.version}:${Date.now()}`;
    const requestScopeKey = commentsScopeKey;
    commentIdempotencyRef.current = idempotencyKey;
    setCommentSubmitting(true);
    setCommentMutationError(null);
    try {
      const result = await proposalRepository.addComment({ proposalRef: proposal.ref, idempotencyKey, body });
      if (commentsScopeRef.current !== requestScopeKey) return;
      setCommentsState((current) => {
        if (current.status !== "ready" || !current.data) return current;
        const alreadyVisible = current.data.items.some((comment) => comment.ref.id === result.data.ref.id);
        return {
          status: "ready",
          error: null,
          data: {
            ...current.data,
            items: alreadyVisible ? current.data.items : [result.data, ...current.data.items],
            page: {
              ...current.data.page,
              returnedCount: current.data.page.returnedCount + Number(!alreadyVisible),
              totalCount: current.data.page.totalCount + Number(!alreadyVisible),
            },
          },
        };
      });
      setCommentBody("");
      commentIdempotencyRef.current = null;
    } catch (caught) {
      if (commentsScopeRef.current !== requestScopeKey) return;
      setCommentMutationError(toDomainErrorEnvelope(caught, "proposal-comment-add").error.message);
    } finally {
      if (commentsScopeRef.current === requestScopeKey) setCommentSubmitting(false);
    }
  };

  if (route.surface === "proposal-approval") {
    const overrideMode = proposal.override?.state === "pending";
    const proposalMode = proposal.state === "submitted" && proposal.readiness === "awaiting_approval";
    if (!overrideMode && !proposalMode) {
      return <div className="proposal-page proposal-review-page"><RouteStateBoundary kind="approval" eyebrow="Review unavailable" title="This Proposal is not awaiting an independent decision." detail={`The current state is ${state.label.toLocaleLowerCase("en-NG")}. Protected review screens only open for a pending exception or submitted Proposal.`} proposal={proposal} onNavigate={onNavigate} /></div>;
    }
    const decisionActions = proposal.override?.allowedActions?.length ? proposal.override.allowedActions : proposal.allowedActions;
    const actions = overrideMode
      ? {
          approve: findAllowedAction(decisionActions, "override.approve"),
          deny: findAllowedAction(decisionActions, "override.deny"),
        }
      : { approve: findAllowedAction(proposal.allowedActions, "proposal.approve"), deny: null };
    return <div className="proposal-page proposal-review-page">
      <button className="proposal-back" type="button" onClick={() => onNavigate({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: "overview" })}><ArrowLeft aria-hidden="true" /> Back to Proposal</button>
      <ReviewDocument proposal={proposal} anchorLine={anchorLine} session={session} timezone={timezone} ruleLabel={ruleLabel} mode={overrideMode ? "override" : "proposal"} actions={actions} onConfirm={setDialogAction} />
      {actionContext ? <DecisionDialog action={actionContext} onClose={() => setDialogAction(null)} onConfirm={perform} busy={busy} error={error} /> : null}
    </div>;
  }

  if (route.surface === "proposal-publish") {
    if (proposal.state !== "approved" || proposal.readiness !== "approved_to_publish") {
      return <div className="proposal-page proposal-review-page"><RouteStateBoundary kind="publication" eyebrow="Publication unavailable" title="This Proposal is not approved for release." detail="Publication is a separate permission and only opens for the current approved version." proposal={proposal} onNavigate={onNavigate} /></div>;
    }
    const action = findAllowedAction(proposal.allowedActions, "proposal.publish") ?? findAllowedAction(proposal.allowedActions, "publication.start");
    return <div className="proposal-page proposal-review-page">
      <button className="proposal-back" type="button" onClick={() => onNavigate({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: "overview" })}><ArrowLeft aria-hidden="true" /> Back to Proposal</button>
      <PublicationReview proposal={proposal} anchorLine={anchorLine} session={session} timezone={timezone} ruleLabel={ruleLabel} action={action} onConfirm={() => setDialogAction("publication.start")} />
      {actionContext ? <DecisionDialog action={actionContext} onClose={() => setDialogAction(null)} onConfirm={perform} busy={busy} error={error} /> : null}
    </div>;
  }

  if (route.surface === "publication" && !publication) {
    return <div className="proposal-page proposal-operation-page"><RouteStateBoundary eyebrow="Operation unavailable" title="This publication operation cannot be opened in the current session." detail="The route may be stale, or this session may not have permission to read the durable release operation." proposal={proposal} onNavigate={onNavigate} /></div>;
  }

  if (route.surface === "publication" && publication) {
    return <div className="proposal-page proposal-operation-page">
      <button className="proposal-back" type="button" onClick={() => onNavigate({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: "overview" })}><ArrowLeft aria-hidden="true" /> Back to Proposal</button>
      <PublicationStatus proposal={proposal} publication={publication} audit={audit} timezone={timezone} onAction={handleAction} />
      {actionContext ? <DecisionDialog action={actionContext} onClose={() => setDialogAction(null)} onConfirm={perform} busy={busy} error={error} /> : null}
    </div>;
  }

  return <div className="proposal-page">
    <header className="proposal-page-head" data-authoritative-result tabIndex="-1">
      <div>
        <div className="breadcrumbs"><button type="button" onClick={() => onNavigate({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: "overview" })}>Proposals</button><ArrowRight aria-hidden="true" /><span>Proposal v{proposal.ref.version}</span></div>
        <div className="proposal-page-head__title"><span><small>Proposal v{proposal.ref.version}</small><h1>{proposal.title}</h1></span><span className={`proposal-state is-${state.tone}`}>{state.tone === "blocked" ? <ShieldWarning aria-hidden="true" /> : <SealCheck aria-hidden="true" />}{state.label}</span></div>
        <p><span><GitBranch aria-hidden="true" />Version {proposal.ref.version}</span><span><Database aria-hidden="true" />Preview {proposal.sourcePreviewRef.version}</span><span>Effective {formatEffectiveAt(proposal.effectiveAt, timezone)}</span></p>
      </div>
    </header>
    <AuthorityJourney proposal={proposal} publication={publication} />
    <section className="proposal-surface">
      <div className="proposal-surface__toolbar">
        <header ref={tabsRef} className="proposal-tabs" role="tablist" aria-label="Proposal views">
          {PROPOSAL_VIEWS.map((id) => <button id={`proposal-tab-${id}`} key={id} type="button" role="tab" aria-controls="proposal-view-panel" aria-selected={view === id} tabIndex={view === id ? 0 : -1} className={view === id ? "is-active" : ""} onKeyDown={onViewTabKeyDown} onClick={() => onNavigate({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: id })}>{id[0].toUpperCase() + id.slice(1)}{id === "lines" ? <span>{proposal.counts.selected.toLocaleString("en-NG")}</span> : id === "margin" ? <span>{proposal.blockers.margin.toLocaleString("en-NG")}</span> : id === "comments" && commentsState.status === "ready" ? <span>{commentsState.data.page.totalCount.toLocaleString("en-NG")}</span> : id === "activity" ? <span>{audit?.events.length ?? 0}</span> : null}</button>)}
        </header>
        <button
          ref={authorityTriggerRef}
          type="button"
          className="proposal-authority-trigger"
          aria-label={authorityOpen ? "Hide next action" : "Review next action"}
          aria-expanded={authorityOpen}
          aria-controls="proposal-authority-panel"
          onClick={() => setAuthorityOpen((open) => !open)}
        >
          <ShieldCheck aria-hidden="true" />
          <span>{authorityOpen ? "Hide next action" : "Review next action"}</span>
        </button>
      </div>
      <div className={`proposal-surface__body${authorityOpen ? " has-authority" : ""}`}>
        <div className="proposal-view" id="proposal-view-panel" role="tabpanel" aria-labelledby={`proposal-tab-${view}`}>
          {view === "overview" ? <OverviewView proposal={proposal} anchorLine={anchorLine} timezone={timezone} ruleLabel={ruleLabel} /> : null}
          {view === "lines" ? <LinesView proposal={proposal} lines={previewLines} timezone={timezone} ruleLabel={ruleLabel} /> : null}
          {view === "margin" && marginState.status === "loading" ? <ProposalViewState state="loading" title="Loading the retained margin snapshot." detail="The exact Proposal reference is being resolved before any policy evidence is shown." /> : null}
          {view === "margin" && marginState.status === "error" ? <ProposalViewState state="error" title="Margin evidence could not be loaded." detail={marginState.error} onRetry={() => setMarginRetry((value) => value + 1)} /> : null}
          {view === "margin" && marginState.status === "ready" ? <MarginView evidence={marginState.data} proposal={proposal} timezone={timezone} ruleLabel={ruleLabel} onAction={handleAction} /> : null}
          {view === "comments" && commentsState.status === "loading" ? <ProposalViewState state="loading" title="Loading version-bound comments." detail="The comment thread is being read against the current Proposal reference." /> : null}
          {view === "comments" && commentsState.status === "error" ? <ProposalViewState state="error" title="Comments could not be loaded." detail={commentsState.error} onRetry={() => setCommentsRetry((value) => value + 1)} /> : null}
          {view === "comments" && commentsState.status === "ready" ? <CommentsView
            thread={commentsState.data}
            proposal={proposal}
            session={session}
            timezone={timezone}
            body={commentBody}
            onBodyChange={changeCommentBody}
            onSubmit={submitComment}
            submitting={commentSubmitting}
            mutationError={commentMutationError}
            loadingMore={commentsLoadingMore}
            loadMoreError={commentsLoadMoreError}
            onLoadMore={loadMoreComments}
          /> : null}
          {view === "activity" ? <ActivityView audit={audit} timezone={timezone} permitted={session.effectiveCapabilities.includes("audit:read")} /> : null}
        </div>
        {authorityOpen ? <button type="button" className="proposal-authority-scrim" aria-label="Dismiss current authority overlay" onClick={closeAuthority} /> : null}
        {authorityOpen ? <AuthorityRail proposal={proposal} publication={publication} session={session} onAction={handleAction} panelRef={authorityRailRef} onClose={closeAuthority} /> : null}
      </div>
    </section>
    {actionContext ? <DecisionDialog action={actionContext} onClose={() => setDialogAction(null)} onConfirm={perform} busy={busy} error={error} /> : null}
  </div>;
}
