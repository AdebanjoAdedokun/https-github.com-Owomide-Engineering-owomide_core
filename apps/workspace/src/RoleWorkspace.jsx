import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, Clock, Warning } from "@phosphor-icons/react";
import { toDomainErrorEnvelope } from "./data/domainError.js";
import { formatRecordedAt, presentRoleCodes, shortActorName } from "./workspacePresenter.js";
import { canOpenWorkspaceRoute, workspaceHome } from "./workspaceAccess.js";
import { WorkspaceSelect } from "./WorkspaceSelect.jsx";

const array = (value) => Array.isArray(value) ? value : [];
const actionFor = (data, code) => array(data?.allowedActions).find((action) => action.code === code);
const can = (data, code) => actionFor(data, code)?.enabled === true;
const REQUEST_STATUSES = Object.freeze({ submitted: "Submitted", reviewing: "In review", resolved: "Resolved", declined: "Declined" });
const requestStatus = (value) => Object.hasOwn(REQUEST_STATUSES, value) ? REQUEST_STATUSES[value] : "Status unavailable";
const textError = (error, domain) => toDomainErrorEnvelope(error, domain).error.message;
const actorName = (actor) => actor?.displayName ? shortActorName(actor.displayName) : "Not assigned";

function useMutationKey(prefix) {
  const previous = useRef(null);
  return (payload) => {
    const fingerprint = JSON.stringify(payload);
    if (previous.current?.fingerprint !== fingerprint) {
      const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      previous.current = { fingerprint, key: `${prefix}:${nonce}` };
    }
    return previous.current.key;
  };
}

function RoleHeader({ title, description, children }) {
  return <header className="role-page-head"><div><p className="role-context">Sample workspace</p><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{children ? <div className="role-head-actions">{children}</div> : null}</header>;
}

function RequestStatus({ status }) {
  const Icon = status === "resolved" ? CheckCircle : status === "declined" ? Warning : Clock;
  return <span className={`role-status is-${status}`}><Icon aria-hidden="true" />{requestStatus(status)}</span>;
}

function InlineError({ message }) {
  return message ? <p className="role-error" role="alert"><Warning aria-hidden="true" /><span>{message}</span></p> : null;
}

function BackToRequests({ onNavigate }) {
  return <button type="button" className="role-back" onClick={() => onNavigate({ surface: "pricing-requests", view: "list" })}><ArrowLeft aria-hidden="true" />Pricing requests</button>;
}

function RequestList({ data: initialData, requests, onNavigate }) {
  const [data, setData] = useState(initialData);
  const [cursors, setCursors] = useState([initialData.page?.cursor ?? null]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const requestSequence = useRef(0);
  useEffect(() => {
    requestSequence.current += 1;
    setData(initialData);
    setCursors([initialData.page?.cursor ?? null]);
    setBusy(false);
    setError(null);
    return () => { requestSequence.current += 1; };
  }, [initialData]);
  const items = array(data.items);
  const own = data.viewScope === "own";
  const loadPage = async (nextCursors) => {
    if (busy) return;
    const sequence = ++requestSequence.current;
    setBusy(true);
    setError(null);
    try {
      const next = await requests.list({ cursor: nextCursors.at(-1), limit: data.page?.limit ?? 25 });
      if (sequence !== requestSequence.current) return;
      setData(next);
      setCursors(nextCursors);
    } catch (caught) { if (sequence === requestSequence.current) setError(textError(caught, "request-list")); }
    finally { if (sequence === requestSequence.current) setBusy(false); }
  };
  const total = data.page?.totalCountRelation === "exact" && Number.isSafeInteger(data.page?.totalCount) ? data.page.totalCount : null;
  const hasPagination = Boolean(data.page?.nextCursor) || cursors.length > 1;
  return <>
    <RoleHeader title="Pricing requests" description={own ? "Track the issues you've raised." : "Review pricing issues from your team."}>
      {can(data, "request.create") ? <button type="button" className="role-primary" onClick={() => onNavigate({ surface: "pricing-request-new", view: "new" })}>New request<ArrowRight aria-hidden="true" /></button> : null}
    </RoleHeader>
    <section className="role-panel" aria-label={own ? "My pricing requests" : "Team pricing requests"} aria-busy={busy}>
      <header className="role-panel-head"><h2>{own ? "My requests" : "Team requests"}</h2><span>{total ?? items.length} {(total ?? items.length) === 1 ? "request" : "requests"}</span></header>
      {error ? <div className="request-page-error"><InlineError message={error} /></div> : null}
      {items.length ? <div className="request-list">{items.map((item) => {
        const readable = !busy && (item.allowedActions ? can(item, "request.read") : can(data, "request.read"));
        return <button type="button" key={item.ref.id} className="request-list-row" aria-disabled={!readable} onClick={() => { if (readable) onNavigate({ surface: "pricing-request", resourceId: item.ref.id, resourceVersion: item.ref.version, view: "detail" }); }}>
          <span className="request-list-identity"><strong>{item.issue}</strong><small>{item.productReference}</small></span>
          <RequestStatus status={item.status} />
          <span className="request-list-date"><small>Raised</small><time dateTime={item.createdAt}>{formatRecordedAt(item.createdAt)}</time></span>
          <ArrowRight aria-hidden="true" />
        </button>;
      })}</div> : <div className="role-empty"><h3>{own ? "No requests yet" : "No requests to review"}</h3><p>{own ? "Flag a price issue with its product reference and context." : "New requests from your team will appear here."}</p>{can(data, "request.create") ? <button type="button" className="role-secondary" onClick={() => onNavigate({ surface: "pricing-request-new", view: "new" })}>Raise a pricing issue</button> : null}</div>}
      {hasPagination ? <footer className="request-pagination"><span role="status">{busy ? "Loading requests…" : `Page ${cursors.length} · ${items.length} shown`}</span><nav aria-label="Request pages"><button className="role-secondary" type="button" aria-label="Previous request page" disabled={busy || cursors.length < 2} onClick={() => loadPage(cursors.slice(0, -1))}><ArrowLeft aria-hidden="true" />Previous</button><button className="role-secondary" type="button" aria-label="Next request page" disabled={busy || !data.page?.nextCursor} onClick={() => loadPage([...cursors, data.page.nextCursor])}>Next<ArrowRight aria-hidden="true" /></button></nav></footer> : null}
    </section>
    <p className="role-footnote">Sample requests only. No prices or live company records are changed.</p>
  </>;
}

function NewRequest({ data, requests, onNavigate }) {
  const [values, setValues] = useState({ productReference: "", issue: "", reason: "", context: "", evidence: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const keyFor = useMutationKey("request-create");
  const createAction = actionFor(data, "request.create");
  const ready = [values.productReference, values.issue, values.reason].every((value) => value.trim());
  const update = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !ready || createAction?.enabled !== true) return;
    const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]));
    setBusy(true);
    setError(null);
    try {
      const result = await requests.create({ ...payload, idempotencyKey: keyFor(payload) });
      onNavigate({ surface: "pricing-request", resourceId: result.data.ref.id, resourceVersion: result.data.ref.version, view: "detail" });
    } catch (caught) {
      setError(textError(caught, "request-create"));
      setBusy(false);
    }
  };
  return <>
    <BackToRequests onNavigate={onNavigate} />
    <RoleHeader title="New pricing request" description="Tell the pricing team what needs attention." />
    <form className="role-panel role-form" aria-label="New pricing request" onSubmit={submit}>
      <div className="role-form-grid">
        <label><span id="request-product-label">Product or SKU reference</span><input aria-labelledby="request-product-label" aria-describedby="request-product-help" value={values.productReference} onChange={update("productReference")} maxLength={160} required disabled={busy || createAction?.enabled !== true} placeholder="For example, KLD-PANT-0032" /><small id="request-product-help">Use the reference you know. No catalog access is needed.</small></label>
        <label><span>Channel or location <em>Optional</em></span><input value={values.context} onChange={update("context")} maxLength={240} disabled={busy || createAction?.enabled !== true} placeholder="For example, retail web · Lagos" /></label>
      </div>
      <label><span>Issue</span><input value={values.issue} onChange={update("issue")} maxLength={120} required disabled={busy || createAction?.enabled !== true} placeholder="Briefly describe the pricing issue" /></label>
      <label><span>Reason</span><textarea value={values.reason} onChange={update("reason")} maxLength={2000} rows={4} required disabled={busy || createAction?.enabled !== true} placeholder="What did you notice, and why does it matter?" /></label>
      <label><span id="request-evidence-label">Supporting evidence <em>Optional</em></span><textarea aria-labelledby="request-evidence-label" aria-describedby="request-evidence-help" value={values.evidence} onChange={update("evidence")} maxLength={2000} rows={3} disabled={busy || createAction?.enabled !== true} placeholder="Add a source reference or supporting details" /><small id="request-evidence-help">Text only in this sample. No files are uploaded.</small></label>
      <InlineError message={error} />
      {createAction?.enabled !== true ? <p className="role-permission">{createAction?.reason?.message ?? "Your current access does not allow pricing requests."}</p> : null}
      <footer className="role-form-footer"><p>A request asks for review. It does not create a Proposal or change a price.</p><button type="submit" className="role-primary" disabled={busy || !ready || createAction?.enabled !== true} aria-busy={busy}>{busy ? "Sending…" : "Send request"}<ArrowRight aria-hidden="true" /></button></footer>
    </form>
  </>;
}

function RequestDetail({ data, requests, session, onNavigate, onUpdated }) {
  const [status, setStatus] = useState("reviewing");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const keyFor = useMutationKey("request-triage");
  const triageAction = actionFor(data, "request.triage");
  const hasTriageAccess = array(session?.effectiveCapabilities).includes("request:triage");
  useEffect(() => { setBusy(false); setNote(""); setError(null); }, [data.ref.id, data.ref.version]);
  const triage = async (event) => {
    event.preventDefault();
    if (busy || !note.trim() || !hasTriageAccess || triageAction?.enabled !== true) return;
    const payload = { requestRef: data.ref, status, note: note.trim() };
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await requests.triage({ ...payload, idempotencyKey: keyFor(payload) });
      await onUpdated(result.data);
      onNavigate({ surface: "pricing-request", resourceId: result.data.ref.id, resourceVersion: result.data.ref.version, view: "detail" });
      setSaved(true);
    } catch (caught) {
      setError(textError(caught, "request-triage"));
    } finally { setBusy(false); }
  };
  return <>
    <BackToRequests onNavigate={onNavigate} />
    <RoleHeader title={data.issue} description={data.productReference}><RequestStatus status={data.status} /></RoleHeader>
    <section className="role-panel" aria-label="Pricing request receipt">
      <header className="role-panel-head"><h2>Request details</h2><span>Version {data.ref.version}</span></header>
      <dl className="role-facts">
        <div><dt>Product reference</dt><dd>{data.productReference}</dd></div>
        {data.context ? <div><dt>Context</dt><dd>{data.context}</dd></div> : null}
        <div><dt>Raised by</dt><dd>{actorName(data.requester)}</dd></div>
        <div><dt>Raised</dt><dd><time dateTime={data.createdAt}>{formatRecordedAt(data.createdAt)}</time></dd></div>
        <div><dt>Reason</dt><dd className="role-preserve-lines">{data.reason}</dd></div>
        <div><dt>Evidence</dt><dd className="role-preserve-lines">{data.evidence || "No supporting evidence added"}</dd></div>
      </dl>
      <p className="role-record-boundary">This receipt tracks your request, not a pricing Proposal.</p>
    </section>
    {hasTriageAccess && data.triage?.note ? <section className="role-panel role-feedback" aria-label="Internal review note"><h2>Internal review note</h2><p className="role-preserve-lines">{data.triage.note}</p></section> : null}
    {hasTriageAccess && triageAction ? <form className="role-panel role-form" aria-label="Review pricing request" onSubmit={triage}>
      <header><h2>Review request</h2><p>Record an internal note. The requester sees the status only.</p></header>
      <div className="role-form-grid"><WorkspaceSelect label="Status" value={status} onChange={setStatus} disabled={busy || !triageAction.enabled} options={[{ value: "reviewing", label: "In review" }, { value: "resolved", label: "Resolved" }, { value: "declined", label: "Declined" }]} /></div>
      <label><span>Internal review note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} required disabled={busy || !triageAction.enabled} placeholder="Explain the outcome or next step for the pricing team" /></label>
      <InlineError message={error} />
      {saved ? <p className="role-success" role="status"><CheckCircle aria-hidden="true" />Sample request updated.</p> : null}
      {!triageAction.enabled ? <p className="role-permission">{triageAction.reason?.message ?? "This request cannot be updated in its current state."}</p> : null}
      <footer className="role-form-footer"><p>This updates the request only.</p><button className="role-primary" type="submit" disabled={busy || !note.trim() || !triageAction.enabled} aria-busy={busy}>{busy ? "Saving…" : "Update request"}</button></footer>
    </form> : null}
    <p className="role-footnote">Sample workflow. No live company records are changed.</p>
  </>;
}

function CompanyAccess({ data, company, onUpdated }) {
  const [analystCanSubmit, setAnalystCanSubmit] = useState(data.policy.analystCanSubmit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const keyFor = useMutationKey("company-policy");
  const updateAction = actionFor(data, "company.policy.update");
  const dirty = analystCanSubmit !== data.policy.analystCanSubmit;
  useEffect(() => { setAnalystCanSubmit(data.policy.analystCanSubmit); setError(null); }, [data.ref.version, data.policy.analystCanSubmit]);
  const save = async (event) => {
    event.preventDefault();
    if (busy || !dirty || updateAction?.enabled !== true) return;
    const payload = { companyRef: data.ref, analystCanSubmit };
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await company.updateAnalystSubmission({ ...payload, idempotencyKey: keyFor(payload) });
      await onUpdated(result.data);
      setSaved(true);
    } catch (caught) { setError(textError(caught, "company-policy")); }
    finally { setBusy(false); }
  };
  return <>
    <RoleHeader title="Company access" description={data.organisation?.name ?? "People and submission policy."} />
    <form className="role-panel role-form" aria-label="Analyst submission policy" onSubmit={save}>
      <header><h2>Analyst submission</h2><p>Choose who moves a prepared draft into approval.</p></header>
      <label className="role-policy-choice"><input type="checkbox" checked={analystCanSubmit} disabled={busy || updateAction?.enabled !== true} onChange={(event) => { setAnalystCanSubmit(event.target.checked); setSaved(false); }} /><span><strong>Analysts can submit drafts</strong><small>{analystCanSubmit ? "Analysts may send their ready drafts for independent approval." : "Analysts prepare drafts. A Pricing Manager submits after handoff."}</small></span></label>
      <p className="role-permission">{updateAction?.enabled === true ? "Account Owner setting in this sample. The production role mapping is not yet verified." : updateAction?.reason?.message ?? "Ask the Account Owner to change this sample setting."}</p>
      <InlineError message={error} />
      {saved ? <p className="role-success" role="status"><CheckCircle aria-hidden="true" />Sample policy saved. The next session refresh uses this policy.</p> : null}
      <footer className="role-form-footer"><p>Policy version {data.ref.version} · No live access changes</p>{updateAction?.enabled === true ? <button type="submit" className="role-primary" disabled={busy || !dirty} aria-busy={busy}>{busy ? "Saving…" : "Save policy"}</button> : null}</footer>
    </form>
    <section className="role-panel" aria-label="Sample team access"><header className="role-panel-head"><h2>Access examples</h2><span>{array(data.members).length} members</span></header><div className="role-member-list">{array(data.members).map((member) => <div key={member.id}><strong>{shortActorName(member.displayName)}</strong><span>{array(member.roleLabels).length ? member.roleLabels.join(" · ") : presentRoleCodes(member.roleCodes).join(" · ")}</span></div>)}</div><p className="role-record-boundary">Sample assignments only. Real membership and permissions come from your organisation identity.</p></section>
  </>;
}

/** New sample-backed destinations; production access remains server-authoritative. */
export function RoleWorkspace({ route, repositories, session, onNavigate, onSessionChange }) {
  const key = [route.surface, route.resourceId, route.resourceVersion, session?.actor?.id, session?.capabilityVersion].join(":");
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ key, status: "loading", data: null, error: null });
  useEffect(() => {
    let active = true;
    setState({ key, status: "loading", data: null, error: null });
    const load = async () => {
      try {
        const data = route.surface === "company-access" ? await repositories.company.get()
          : route.surface === "pricing-request" ? await repositories.requests.get({ requestId: route.resourceId, ...(route.resourceVersion ? { requestVersion: route.resourceVersion } : {}) })
            : await repositories.requests.list();
        if (active) setState({ key, status: "ready", data, error: null });
      } catch (error) {
        const envelope = toDomainErrorEnvelope(error, "role-workspace");
        if (active) setState({ key, status: "error", data: null, error: envelope.error.message, errorCode: envelope.error.code });
      }
    };
    load();
    return () => { active = false; };
  }, [key, repositories, retry, route.surface, route.resourceId, route.resourceVersion]);
  const updated = (data) => setState({ key, status: "ready", data, error: null });
  const policyUpdated = async (data) => {
    updated(data);
    if (onSessionChange) onSessionChange(await repositories.identity.getSession());
  };
  const current = state.key === key ? state : { status: "loading" };
  const requestListRoute = { surface: "pricing-requests", view: "list" };
  const recoveryRoute = route.surface.startsWith("pricing-request") && canOpenWorkspaceRoute(session, requestListRoute) ? requestListRoute : workspaceHome(session);
  const recoveryLabel = recoveryRoute.surface === "pricing-requests" ? "Pricing requests" : "Back to workspace";
  return <div className="role-workspace">
    {current.status === "loading" ? <div className="role-state" role="status"><h1>Loading workspace…</h1><p>Resolving this view and your access.</p></div>
      : current.status === "error" ? <div className="role-state" role="alert"><h1>This view is unavailable</h1><p>{current.error}</p><div>{current.errorCode !== "STALE_VERSION" ? <button className="role-secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button> : null}<button className="role-secondary" type="button" onClick={() => onNavigate(recoveryRoute)}>{recoveryLabel}</button></div></div>
        : route.surface === "pricing-request-new" ? <NewRequest data={current.data} requests={repositories.requests} onNavigate={onNavigate} />
          : route.surface === "pricing-request" ? <RequestDetail key={current.data.ref.id} data={current.data} requests={repositories.requests} session={session} onNavigate={onNavigate} onUpdated={updated} />
            : route.surface === "company-access" ? <CompanyAccess data={current.data} company={repositories.company} onUpdated={policyUpdated} />
              : <RequestList data={current.data} requests={repositories.requests} onNavigate={onNavigate} />}
  </div>;
}

/** Parent mounts this beside the exact current Proposal and refetches onHandoff. */
export function ProposalHandoff({ proposal, proposals, onHandoff, onRevisionStarted }) {
  const [assigneeId, setAssigneeId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(proposal.title ?? "");
  const keyFor = useMutationKey("proposal-handoff");
  const editKeyFor = useMutationKey("proposal-draft-edit");
  const revisionKeyFor = useMutationKey("proposal-pricing-revision");
  const confirmationRef = useRef(null);
  const titleRef = useRef(null);
  const handoffAction = actionFor(proposal, "proposal.handoff");
  const submitAction = actionFor(proposal, "proposal.submit");
  const revisionAction = actionFor(proposal, "proposal.revision.start");
  const canEditTitle = can(proposal, "proposal.draft.edit");
  const candidates = array(proposal.handoffCandidates);
  const candidate = candidates.find((member) => member.id === assigneeId);
  useEffect(() => { setAssigneeId(""); setConfirming(false); setError(null); setEditingTitle(false); setDraftTitle(proposal.title ?? ""); }, [proposal.ref.id, proposal.ref.version, proposal.title]);
  useEffect(() => { if (confirming) confirmationRef.current?.focus(); }, [confirming]);
  useEffect(() => { if (editingTitle) titleRef.current?.focus(); }, [editingTitle]);
  if (!handoffAction && !proposal.submissionOwner && !canEditTitle && !proposal.returnDecision) return null;
  const updateTitle = async (event) => {
    event.preventDefault();
    if (busy || !canEditTitle || !draftTitle.trim() || draftTitle.trim() === proposal.title) return;
    const payload = { proposalRef: proposal.ref, title: draftTitle.trim() };
    setBusy(true);
    setError(null);
    try {
      const result = await proposals.updateDraft({ ...payload, idempotencyKey: editKeyFor(payload) });
      setEditingTitle(false);
      await onHandoff?.(result);
    } catch (caught) { setError(textError(caught, "proposal-draft-edit")); }
    finally { setBusy(false); }
  };
  const handoff = async () => {
    if (busy || !candidate || !confirming || handoffAction?.enabled !== true) return;
    const payload = { proposalRef: proposal.ref, assigneeId: candidate.id };
    setBusy(true);
    setError(null);
    try {
      const result = await proposals.handoff({ ...payload, idempotencyKey: keyFor(payload) });
      setConfirming(false);
      await onHandoff?.(result);
    } catch (caught) { setError(textError(caught, "proposal-handoff")); }
    finally { setBusy(false); }
  };
  const startRevision = async () => {
    if (busy || revisionAction?.enabled !== true || typeof proposals.startRevision !== "function" || !onRevisionStarted) return;
    const payload = { proposalRef: proposal.ref };
    setBusy(true);
    setError(null);
    try {
      const result = await proposals.startRevision({ ...payload, idempotencyKey: revisionKeyFor(payload) });
      await onRevisionStarted(result);
    } catch (caught) { setError(textError(caught, "proposal-pricing-revision")); }
    finally { setBusy(false); }
  };
  return <section className="proposal-handoff" aria-label="Draft submission handoff">
    {proposal.returnDecision?.reason ? <div className="draft-return-note"><h3>{proposal.returnDecision.addressedAt ? "Pricing revision prepared" : "Returned for changes"}</h3><p className="role-preserve-lines">{proposal.returnDecision.reason}</p><small>{actorName(proposal.returnDecision.actor)}{proposal.returnDecision.reviewedProposalRef?.version ? ` · Review of version ${proposal.returnDecision.reviewedProposalRef.version}` : ""}{proposal.returnDecision.decidedAt ? <> · <time dateTime={proposal.returnDecision.decidedAt}>{formatRecordedAt(proposal.returnDecision.decidedAt)}</time></> : null}</small>{proposal.returnDecision.addressedAt ? <p>This replacement uses new pricing evidence and still needs a fresh submission and independent review.</p> : <><p>Adjust a prepared pricing rule, generate a new Preview, then create a replacement draft. This reviewed version and its reason stay in history.</p>{revisionAction && typeof proposals.startRevision === "function" && onRevisionStarted ? <button className="role-primary" type="button" disabled={busy || confirming || editingTitle || !revisionAction.enabled} aria-busy={busy} onClick={startRevision}>{proposal.pricingRevision ? "Continue pricing revision" : "Revise pricing evidence"}<ArrowRight aria-hidden="true" /></button> : null}{revisionAction?.enabled === false ? <p className="role-permission">{revisionAction.reason?.message}</p> : null}</>}</div> : null}
    <header className="draft-actions-head"><div><h2>Submission handoff</h2><p>Draft owner: {actorName(proposal.submissionOwner ?? proposal.author)}.</p></div>{canEditTitle ? <button className="role-secondary" type="button" disabled={busy || confirming} aria-expanded={editingTitle} aria-controls="draft-title-form" onClick={() => { setEditingTitle((current) => !current); setError(null); }}>Edit draft title</button> : null}</header>
    {submitAction?.enabled === false && submitAction.reason?.message ? <p className="role-permission">{submitAction.reason.message}</p> : null}
    {canEditTitle && editingTitle ? <form id="draft-title-form" className="draft-title-form" aria-label="Edit draft title" onSubmit={updateTitle}><label><span>Draft title</span><input ref={titleRef} value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={120} required disabled={busy} /></label><p>Changes to prices or scope need a new Preview.</p><div><button className="role-secondary" type="button" disabled={busy} onClick={() => setEditingTitle(false)}>Cancel edit</button><button className="role-primary" type="submit" disabled={busy || !draftTitle.trim() || draftTitle.trim() === proposal.title} aria-busy={busy}>{busy ? "Saving…" : "Save title"}</button></div></form> : null}
    {handoffAction?.enabled === true ? <>
      <WorkspaceSelect label="Pricing Manager" value={assigneeId} onChange={setAssigneeId}
        disabled={busy || confirming || editingTitle}
        placeholder={candidates.length ? "Choose a manager" : "No eligible managers"}
        options={candidates.map((member) => ({ value: member.id, label: shortActorName(member.displayName), description: "Pricing Manager" }))} />
      {!candidates.length ? <p className="role-permission">No eligible manager is assigned. Ask the Account Owner to resolve access.</p> : null}
      {confirming && candidate ? <div className="handoff-confirmation" ref={confirmationRef} tabIndex={-1} role="group" aria-label={`Confirm handoff of version ${proposal.ref.version}`}><h3>Hand off version {proposal.ref.version}?</h3><p>{shortActorName(candidate.displayName)} will own submission. {actorName(proposal.author)} remains the author. This does not submit, approve or publish.</p><div><button className="role-secondary" type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button><button className="role-primary" type="button" disabled={busy} aria-busy={busy} onClick={handoff}>{busy ? "Handing off…" : "Confirm handoff"}</button></div></div> : <button className="role-secondary" type="button" disabled={!candidate || busy || editingTitle} onClick={() => setConfirming(true)}>Review handoff<ArrowRight aria-hidden="true" /></button>}
    </> : <p className="role-permission">{handoffAction?.reason?.message ?? "The assigned submission owner takes the next step."}</p>}
    <InlineError message={error} />
  </section>;
}
