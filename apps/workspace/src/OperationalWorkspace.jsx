import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  ClockCounterClockwise,
  Database,
  FileXls,
  FunnelSimple,
  GitBranch,
  Info,
  LinkSimple,
  ListChecks,
  LockKey,
  MagnifyingGlass,
  MapPin,
  MinusCircle,
  Package,
  PencilSimple,
  Receipt,
  Rows,
  SealCheck,
  ShieldCheck,
  ShieldWarning,
  SlidersHorizontal,
  UploadSimple,
  Warning,
  X,
} from "@phosphor-icons/react";
import { toDomainErrorEnvelope } from "./data/domainError.js";
import { formatMoney, formatEffectiveAt, formatRecordedAt, formatRelativeTime, shortActorName, shortOrganisationName } from "./workspacePresenter.js";
import { workspaceHash } from "./workspaceRouting.js";
import { canOpenWorkspaceRoute } from "./workspaceAccess.js";
import { RevisionContext } from "./WorkflowGuidance.jsx";
import { CursorPager, INSPECTOR_DOCK_MIN_SURFACE, WorkspaceViewTabs } from "./workspaceTablePatterns.jsx";
import "./queue-clarity.css";

const number = (value) => Number(value ?? 0).toLocaleString("en-NG");
const list = (value) => Array.isArray(value) ? value : [];
const money = formatMoney;
const dateTime = formatRecordedAt;
let pendingQueueTabFocus = null;
const clearPendingQueueTabFocus = () => { pendingQueueTabFocus = null; };

function catalogView(item) {
  const summary = item?.summary ?? item ?? {};
  return {
    ...summary,
    id: summary.canonicalSkuId ?? summary.id ?? summary.ref?.id,
    productName: summary.product?.name ?? summary.productName,
    variant: summary.product?.variant ?? summary.variant,
    scopeLabel: [summary.channel?.name, summary.location?.name].filter(Boolean).join(" · "),
    priceLabel: money(summary.currentPrice),
    costLabel: summary.fieldVisibility?.economics === "restricted" ? "Restricted by access" : money(summary.currentCost),
    effectiveAtLabel: formatEffectiveAt(summary.effectiveAt),
    recordedAtLabel: formatRecordedAt(summary.source?.importedAt),
    sourceLabel: summary.source?.fileName ? `${summary.source.fileName} · row ${summary.source.rowNumber}` : "Trusted import record",
    sourceSummaryLabel: summary.source?.rowNumber ? `Catalog baseline · row ${summary.source.rowNumber}` : "Trusted import record",
    statusLabel: summary.priceState === "missing" ? "Price missing" : summary.status === "supplier-hold" ? "Supplier hold" : "Current",
    statusTone: summary.priceState === "missing" || summary.status === "supplier-hold" ? "attention" : "success",
    identifiers: summary.identifiers ?? [{ namespace: "Merchant SKU", value: summary.merchantSku, primary: true }],
  };
}

const ruleValue = (rule) => `${((rule?.effect?.basisPoints ?? rule?.marginFloorBasisPoints ?? 0) / 100).toFixed(2)}%`;
const ruleFloorProgress = (rule) => `${Math.round(Math.min(100, Math.max(0, ((rule?.effect?.basisPoints ?? rule?.marginFloorBasisPoints ?? 0) / 2500) * 100)) * 10) / 10}%`;
const displayRuleVersion = (version) => {
  if (!version) return "Current";
  const designVersion = String(version).match(/^0\.0\.0-design\.(\d+)$/);
  return designVersion ? `Design v${designVersion[1]}` : `v${version}`;
};
const humanise = (value = "") => value.replaceAll(".", " ").replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const ruleScopeLabel = (scope = "global") => scope === "sku" ? "SKU" : humanise(scope);
function auditEventClass(eventType = "") {
  const type = eventType.toLowerCase();
  if (/blocked|failed|denied|rejected|error/.test(type)) return "risk";
  if (/created|uploaded|imported/.test(type)) return "created";
  if (/rule|evaluated|mapping|policy/.test(type)) return "policy";
  if (/approved|published|reconciled|confirmed|saved|completed/.test(type)) return "complete";
  return "change";
}

function AuditEventIcon({ eventClass }) {
  const Icon = eventClass === "risk" ? ShieldWarning : eventClass === "created" ? Receipt : eventClass === "policy" ? SlidersHorizontal : eventClass === "complete" ? SealCheck : ClockCounterClockwise;
  return <Icon aria-hidden="true" />;
}

function auditView(event) {
  return {
    ...event,
    label: humanise(event.eventType ?? event.type),
    source: event.sourceType,
    entityId: event.object?.id ?? event.entityId,
    entityType: event.object?.type ?? event.entityType,
    version: event.object?.version ?? event.version,
    actor: event.actorId ? { displayName: event.actorRole ? `${event.actorRole} actor` : "Resolved workspace actor" } : "Owómidé system",
    role: event.actorRole ?? (event.sourceType === "system" ? "System" : "Workspace member"),
    detail: event.reason,
    entityLabel: `${humanise(event.object?.type ?? event.entityType ?? "record")} · v${event.object?.version ?? event.version ?? "current"}`,
    eventClass: auditEventClass(event.eventType ?? event.type),
    occurredAtLabel: formatRecordedAt(event.occurredAt),
    occurredAtRelativeLabel: formatRelativeTime(event.occurredAt),
  };
}

const IMPORT_STAGE_LABELS = [
  ["upload", "Upload"],
  ["profile", "Profile"],
  ["map", "Map"],
  ["validate", "Validate"],
  ["review", "Review"],
  ["commit", "Commit"],
  ["result", "Result"],
];
const CATALOG_PAGE_LIMIT = 8;

function importRequestKey(actionCode, version = "new") {
  const entropy = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `import:${actionCode}:${version}:${entropy}`;
}

function Eyebrow({ children }) {
  return <p className="ops-eyebrow">{children}</p>;
}

function ScreenHeader({ eyebrow, title, description, meta, children }) {
  return <header className="ops-page-head">
    <div>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {meta ? <div className="ops-page-meta">{meta}</div> : null}
    </div>
    {children ? <div className="ops-page-actions">{children}</div> : null}
  </header>;
}

function StatusPill({ tone = "neutral", children }) {
  const Icon = tone === "danger" ? ShieldWarning : tone === "success" ? CheckCircle : tone === "attention" ? Clock : Info;
  return <span className={`ops-status is-${tone}`}><Icon aria-hidden="true" />{children}</span>;
}

function EmptyBoundary({ title, detail, actionLabel, onAction }) {
  return <div className="ops-empty"><MagnifyingGlass aria-hidden="true" /><strong>{title}</strong><span>{detail}</span>{actionLabel ? <button type="button" onClick={onAction}>{actionLabel}</button> : null}</div>;
}

function LoadingBoundary({ title = "Resolving workspace data" }) {
  return <div className="ops-loading" role="status" aria-live="polite"><Database aria-hidden="true" /><strong>{title}</strong><span>Identity, object state and permitted actions are resolving from the fixture repository.</span><i aria-hidden="true" /></div>;
}

function ErrorBoundary({ error, onRetry, actionLabel, onAction }) {
  return <div className="ops-error" role="alert"><ShieldWarning aria-hidden="true" /><strong>This workspace view could not be loaded.</strong><span>{error?.error?.message ?? "The repository returned an unknown error."}</span>{onAction && actionLabel ? <button type="button" onClick={onAction}>{actionLabel}</button> : onRetry ? <button type="button" onClick={onRetry}>Retry</button> : null}</div>;
}

function Surface({ className = "", children, label, surfaceRef }) {
  return <section ref={surfaceRef} className={`ops-surface ${className}`} aria-label={label}>{children}</section>;
}

export function LoginScreen({ repositories, onSignedIn, session, marketingHref }) {
  const [state, setState] = useState("ready");
  const [error, setError] = useState(null);

  const signIn = async () => {
    setState("loading");
    setError(null);
    try {
      const session = repositories.identity.signIn
        ? await repositories.identity.signIn()
        : await repositories.identity.getSession();
      onSignedIn(session);
    } catch (nextError) {
      setError(toDomainErrorEnvelope(nextError, "fixture-sign-in"));
      setState("error");
    }
  };

  const organisationName = shortOrganisationName(session?.organisation?.name ?? "Owómidé sample workspace");

  return <main className="login-screen">
    <section className="login-story" aria-label="Owómidé product context">
      <a className="login-brand" href={marketingHref} aria-label="Back to Owómidé website"><img src="/assets/owomide-wordmark.png" alt="Owómidé" /></a>
      <div>
        <Eyebrow>THE PRICING OPERATING SYSTEM</Eyebrow>
        <h1>Pricing decisions, governed.</h1>
        <p>Evidence, policy and authority stay with every change.</p>
      </div>
    </section>
    <section className="login-panel" aria-labelledby="login-title">
      <a className="login-back" href={marketingHref}><ArrowLeft aria-hidden="true" />Back to website</a>
      <div className="login-panel__mark"><LockKey aria-hidden="true" /></div>
      <Eyebrow>WORKSPACE ACCESS</Eyebrow>
      <h2 id="login-title">Sign in to Owómidé.</h2>
      <p>Open the sample workspace.</p>
      <div className="login-context"><span>Sample workspace</span><strong>{organisationName}</strong><small>Fictional data · No live writes</small></div>
      {error ? <div className="login-error" role="alert"><ShieldWarning aria-hidden="true" /><span>{error.error.message}</span></div> : null}
      <button type="button" className="ops-primary" onClick={signIn} disabled={state === "loading"}><span>{state === "loading" ? "Signing in…" : "Continue"}</span><ArrowRight aria-hidden="true" /></button>
      <small className="login-boundary">Production access uses your organisation identity.</small>
    </section>
  </main>;
}

function useOperationalResource(route, repositories, session) {
  const resourceKey = [route.surface, route.resourceId, route.resourceVersion, route.operationId, route.operationVersion, route.entityType, route.view, session?.actor?.id, session?.capabilityVersion].filter(Boolean).join(":");
  const requestSequenceRef = useRef(0);
  const [state, setState] = useState({ key: resourceKey, status: "loading", data: null, error: null });
  const load = useCallback(async () => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setState({ key: resourceKey, status: "loading", data: null, error: null });
    try {
      let data = null;
      if (route.surface === "work") data = await repositories.workQueue.list({ view: route.view, limit: 20 });
      else if (route.surface === "catalog") data = await repositories.catalog.list({ limit: CATALOG_PAGE_LIMIT });
      else if (route.surface === "catalog-detail") data = await repositories.catalog.getDetail({ skuId: route.resourceId });
      else if (route.surface === "imports") data = await repositories.imports.list({ limit: 20 });
      else if (route.surface.startsWith("import-") && route.surface !== "import-new") {
        data = await repositories.imports.getJourney({ batchId: route.resourceId, version: route.resourceVersion, stage: route.surface.replace("import-", "") });
        if (route.operationId || route.operationVersion) {
          const operation = await repositories.imports.getCommitOperation({ operationRef: { kind: "resource", id: route.operationId, version: route.operationVersion } });
          data = { ...data, commit: { ...data.commit, operation, operationRef: operation.ref } };
        }
      }
      else if (route.surface === "repricing-scope") data = await repositories.repricing.getScope();
      else if (route.surface === "repricing-rule") data = await repositories.repricing.getRule({ ref: { kind: "resource", id: route.resourceId, version: route.resourceVersion } });
      else if (route.surface === "proposals") data = await repositories.proposals.list({ view: route.view, limit: 20 });
      else if (route.surface === "rules") data = await repositories.rules.list({ limit: 20 });
      else if (route.surface === "rule-detail") data = await repositories.rules.getDetail({ ruleId: route.resourceId });
      else if (route.surface === "audit") data = await repositories.audit.list({ limit: 30 });
      else if (route.surface === "audit-detail") data = await repositories.audit.getEntityHistory({ entityType: route.entityType, entityId: route.resourceId, entityVersion: route.resourceVersion });
      if (requestSequence !== requestSequenceRef.current) return;
      setState({ key: resourceKey, status: "ready", data, error: null });
    } catch (error) {
      if (requestSequence !== requestSequenceRef.current) return;
      setState({ key: resourceKey, status: "error", data: null, error: toDomainErrorEnvelope(error, `operational-${route.surface}`) });
    }
  }, [repositories, resourceKey, route.entityType, route.operationId, route.operationVersion, route.resourceId, route.resourceVersion, route.surface, route.view]);
  useEffect(() => {
    load();
    return () => { requestSequenceRef.current += 1; };
  }, [load]);
  return state.key === resourceKey ? { ...state, reload: load } : { key: resourceKey, status: "loading", data: null, error: null, reload: load };
}

function StageRail({ current, reached, batchRef, operationRef, onNavigate }) {
  const currentIndex = IMPORT_STAGE_LABELS.findIndex(([id]) => id === current);
  const reachedIndex = IMPORT_STAGE_LABELS.findIndex(([id]) => id === reached);
  const railRef = useRef(null);
  useLayoutEffect(() => {
    const centreCurrentStage = () => {
      const rail = railRef.current;
      const active = rail?.querySelector('[aria-current="step"]');
      if (!rail || !active || rail.scrollWidth <= rail.clientWidth || typeof rail.scrollTo !== "function") return;
      const railRect = rail.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const contentLeft = rail.scrollLeft + activeRect.left - railRect.left;
      const left = contentLeft - ((rail.clientWidth - activeRect.width) / 2);
      rail.scrollTo({ left: Math.min(Math.max(0, left), rail.scrollWidth - rail.clientWidth), behavior: "auto" });
    };
    centreCurrentStage();
    const handleResize = () => centreCurrentStage();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [current]);
  return <nav ref={railRef} className="import-stage-rail" aria-label="Import progress">
    {IMPORT_STAGE_LABELS.map(([id, label], index) => <button key={id} type="button" className={index === currentIndex ? "is-current" : index < reachedIndex ? "is-complete" : ""} aria-current={index === currentIndex ? "step" : undefined} aria-label={`Step ${index + 1} of ${IMPORT_STAGE_LABELS.length}: ${label}${index < reachedIndex ? ", completed" : index === currentIndex ? ", current" : ", not reached"}`} disabled={index > reachedIndex} onClick={() => onNavigate({ surface: `import-${id}`, resourceId: batchRef.id, resourceVersion: batchRef.version, operationId: id === "commit" ? operationRef?.id : null, operationVersion: id === "commit" ? operationRef?.version : null, view: id })}><span>{index < reachedIndex ? <Check aria-hidden="true" /> : index + 1}</span><strong>{label}</strong></button>)}
  </nav>;
}

// A work item may describe a change-set while its action opens an exact Preview.
// Never substitute the item's identity or a demo route for a missing action target.
function workQueueDestination(item) {
  const action = list(item.allowedActions).find((candidate) => candidate.code === "work.open");
  const ref = action?.targetRef;
  if (action?.enabled !== true || !["resource", "fixture-scenario"].includes(ref?.kind)
    || typeof ref?.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(ref.id)
    || typeof ref?.version !== "string" || !ref.version.trim()) return null;
  const destinations = {
    import: { surface: "import-map", view: "map" },
    proposal: { surface: "proposal", view: "overview" },
    repricing: { surface: "repricing", view: "preview" },
  };
  const destination = Object.hasOwn(destinations, item.type) ? destinations[item.type] : null;
  return destination ? { ...destination, resourceId: ref.id, resourceVersion: ref.version } : null;
}

function workQueueScope(item) {
  const attention = item.counts?.attention;
  const total = item.counts?.total;
  const isImport = item.type === "import";
  const unit = isImport ? Number(total) === 1 ? "source row" : "source rows" : Number(total) === 1 ? "line in scope" : "lines in scope";
  const attentionLabel = isImport ? Number(attention) === 1 ? "mapping issue" : "mapping issues" : Number(attention) === 1 ? "line needs review" : "lines need review";
  return {
    attention: attention == null ? "Attention count unavailable" : `${number(attention)} ${attentionLabel}`,
    total: total == null ? "Scope unavailable" : `${number(total)} ${unit}`,
  };
}

function QueueScreen({ data, route, onNavigate, session }) {
  const [view, setView] = useState(route.view ?? "needs-me");
  const [query, setQuery] = useState("");
  const items = list(data?.items);
  const capabilities = new Set(list(session?.effectiveCapabilities));
  const inView = (item) => (view === "needs-me" && item.needsCurrentActor !== false) || (view === "blocked" && item.status === "blocked") || (view === "awaiting-approval" && item.status === "submitted") || (view === "ready-to-publish" && item.status === "approved") || (view === "incomplete-rollout" && item.status === "incomplete");
  const normalizedQuery = query.trim().toLowerCase();
  const shown = items.filter(inView).filter((item) => !normalizedQuery || `${item.title} ${item.reason} ${item.status}`.toLowerCase().includes(normalizedQuery));
  const views = [
    ["needs-me", "Needs me"], ["blocked", "Blocked"], ["awaiting-approval", "Awaiting approval"], ["ready-to-publish", "Ready to publish"], ["incomplete-rollout", "Incomplete rollout"],
  ];
  const emptyView = {
    "needs-me": ["You're up to date.", "Assigned work will appear here."],
    blocked: ["No blocked work.", "Items needing a decision or correction will appear here."],
    "awaiting-approval": ["Nothing awaiting approval.", "Submitted proposals will appear here."],
    "ready-to-publish": ["Nothing ready to publish.", "Approved proposals will appear here."],
    "incomplete-rollout": ["No incomplete rollouts.", "Releases needing reconciliation will appear here."],
  }[view] ?? ["No work in this view.", "Choose another queue view."];
  const move = (next, { keyboard = false } = {}) => {
    if (keyboard) pendingQueueTabFocus = next;
    setView(next);
    onNavigate({ surface: "work", view: next }, { replace: true });
  };
  return <>
    <ScreenHeader eyebrow="WORK" title="Work queue" description="Actions waiting on you.">
      {capabilities.has("import:prepare") ? <button className="ops-secondary" type="button" onClick={() => onNavigate({ surface: "import-new", view: "create" })}><UploadSimple aria-hidden="true" />Import data</button> : null}
      {capabilities.has("repricing:prepare") ? <button className="ops-primary" type="button" onClick={() => onNavigate({ surface: "repricing-scope", resourceId: "new", view: "scope" })}><span>New repricing</span><ArrowRight aria-hidden="true" /></button> : null}
    </ScreenHeader>
    <Surface label="Work queue" className="queue-clarity">
      <header className="ops-toolbar"><WorkspaceViewTabs
        idPrefix="work-queue-tab"
        label="Work queue views"
        panelId="work-queue-results"
        value={view}
        onChange={move}
        focusSelected={pendingQueueTabFocus === view}
        onFocusSelected={clearPendingQueueTabFocus}
        views={views.map(([id, label]) => ({ id, label, count: id === "needs-me" ? items.filter((item) => item.needsCurrentActor !== false).length : items.filter((item) => id === "blocked" ? item.status === "blocked" : id === "awaiting-approval" ? item.status === "submitted" : id === "ready-to-publish" ? item.status === "approved" : item.status === "incomplete").length }))}
      /><label className="ops-search"><MagnifyingGlass aria-hidden="true" /><input aria-label="Search work" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search work" /></label></header>
      <div id="work-queue-results" role="tabpanel" aria-labelledby={`work-queue-tab-${view}`}>{shown.length ? <div className="queue-list">{shown.map((item) => {
        const target = workQueueDestination(item);
        const openAction = list(item.allowedActions).find((action) => action.code === "work.open");
        const unavailableReason = openAction?.reason?.message || "This destination is unavailable. Refresh the queue to try again.";
        const reasonId = `work-action-reason-${item.id}`;
        const stage = item.type === "repricing" ? "Repricing preview" : item.type === "proposal" ? "Proposal" : item.type === "import" ? "Import mapping" : humanise(item.type);
        const scope = workQueueScope(item);
        return <button type="button" className="queue-row" key={item.id} aria-disabled={!target} aria-describedby={!target ? reasonId : undefined} onClick={() => { if (target) onNavigate(target); }}>
          <span className="queue-row__main"><span className="queue-row__kind">{stage}</span><strong>{item.title}</strong><small>{item.reason}</small>{!target ? <small id={reasonId}>{unavailableReason}</small> : null}</span>
          <StatusPill tone={item.status === "blocked" ? "danger" : item.status === "approved" ? "success" : "attention"}>{humanise(item.status)}</StatusPill>
          <span className="queue-row__actor"><small>Next actor</small><strong>{item.nextActor ? shortActorName(item.nextActor) : "Unassigned"}</strong></span>
          <span className="queue-row__source"><strong>{scope.attention}</strong><small>{scope.total}</small></span>
          <span className="queue-row__updated"><small>Updated</small><time dateTime={item.updatedAt}>{formatRecordedAt(item.updatedAt)}</time></span>
          {target ? <CaretRight aria-hidden="true" /> : <LockKey aria-hidden="true" />}
        </button>;
      })}</div> : <EmptyBoundary
        title={normalizedQuery ? "No matching work in this view." : emptyView[0]}
        detail={normalizedQuery ? "Try another search or clear it." : emptyView[1]}
        actionLabel={normalizedQuery ? "Clear search" : view !== "needs-me" && items.length ? "Back to my work" : undefined}
        onAction={() => {
          if (normalizedQuery) setQuery("");
          else { pendingQueueTabFocus = "needs-me"; move("needs-me"); }
        }}
      />}</div>
      <footer className="queue-result-summary" aria-label="Work queue summary"><span>{number(shown.length)} work {shown.length === 1 ? "item" : "items"}</span><small>Line counts may overlap between stages.</small></footer>
    </Surface>
  </>;
}

function CatalogScreen({ data, catalog, session, onNavigate }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [pageData, setPageData] = useState(data);
  const [pageIndex, setPageIndex] = useState(0);
  const [cursorHistory, setCursorHistory] = useState([null]);
  const [paging, setPaging] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [catalogDocked, setCatalogDocked] = useState(false);
  const selectedOriginRef = useRef(null);
  const selectedPeekRef = useRef(null);
  const catalogSurfaceRef = useRef(null);
  const pageRequestRef = useRef(0);
  const pageRetryRef = useRef(null);
  const items = list(pageData?.items).map(catalogView);
  const sampleCount = pageData?.filterResult?.sample?.matchedCount ?? items.length;
  const authoritativeCount = pageData?.page?.totalCount ?? items.length;
  const appliedQuery = pageData?.filterResult?.query ?? "";
  const normalizedQuery = query.trim();
  const queryPending = normalizedQuery !== appliedQuery;
  const inspectorOwnsSurface = Boolean(selected && !catalogDocked);

  useEffect(() => {
    setPageData(data);
    setPageIndex(0);
    setCursorHistory([null]);
    setPageError(null);
    pageRetryRef.current = null;
  }, [data]);

  useLayoutEffect(() => {
    const surface = catalogSurfaceRef.current;
    if (!surface) return undefined;
    const update = () => setCatalogDocked(surface.getBoundingClientRect().width >= INSPECTOR_DOCK_MIN_SURFACE);
    update();
    const observer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(update) : null;
    observer?.observe(surface);
    globalThis.window?.addEventListener?.("resize", update);
    return () => {
      observer?.disconnect();
      globalThis.window?.removeEventListener?.("resize", update);
    };
  }, []);

  const closeSelected = useCallback(() => {
    setSelected(null);
    window.requestAnimationFrame(() => selectedOriginRef.current?.focus?.());
  }, []);

  const openSelected = (event, item) => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      onNavigate({ surface: "catalog-detail", resourceId: item.id, view: "detail" });
      return;
    }
    selectedOriginRef.current = event.currentTarget;
    setSelected(item);
  };

  useEffect(() => {
    if (!selected) return undefined;
    const frame = window.requestAnimationFrame(() => selectedPeekRef.current?.focus?.({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  const loadPage = useCallback(async ({ cursor, nextIndex, nextHistory, searchQuery }) => {
    const request = pageRequestRef.current + 1;
    pageRequestRef.current = request;
    pageRetryRef.current = { cursor, nextIndex, nextHistory, searchQuery };
    setPaging(true);
    setPageError(null);
    try {
      const nextPage = await catalog.list({ query: searchQuery || undefined, cursor, limit: CATALOG_PAGE_LIMIT });
      if (pageRequestRef.current !== request) return;
      setPageData(nextPage);
      setPageIndex(nextIndex);
      setCursorHistory(nextHistory);
      setSelected(null);
      selectedOriginRef.current = null;
      pageRetryRef.current = null;
    } catch (error) {
      if (pageRequestRef.current !== request) return;
      setPageError(toDomainErrorEnvelope(error, "catalog-page"));
    } finally {
      if (pageRequestRef.current === request) setPaging(false);
    }
  }, [catalog]);

  useEffect(() => {
    if (!queryPending) return undefined;
    pageRequestRef.current += 1;
    pageRetryRef.current = null;
    setPaging(false);
    setPageError(null);
    const timeout = window.setTimeout(() => {
      loadPage({ cursor: null, nextIndex: 0, nextHistory: [null], searchQuery: normalizedQuery });
    }, 260);
    return () => window.clearTimeout(timeout);
  }, [loadPage, normalizedQuery, queryPending]);

  const previousPage = () => {
    if (pageIndex === 0 || paging || queryPending) return;
    loadPage({ cursor: cursorHistory[pageIndex - 1] ?? null, nextIndex: pageIndex - 1, nextHistory: cursorHistory, searchQuery: normalizedQuery });
  };

  const nextPage = () => {
    if (!pageData?.page?.nextCursor || paging || queryPending) return;
    const nextHistory = [...cursorHistory.slice(0, pageIndex + 1), pageData.page.nextCursor];
    loadPage({ cursor: pageData.page.nextCursor, nextIndex: pageIndex + 1, nextHistory, searchQuery: normalizedQuery });
  };

  const modeClass = selected ? catalogDocked ? " is-docked" : " is-overlay" : "";
  return <>
    <ScreenHeader eyebrow="CATALOG" title="Catalog" description="Products, prices and source records.">
      {canOpenWorkspaceRoute(session, { surface: "imports" }) ? <button className="ops-secondary" type="button" onClick={() => onNavigate({ surface: "imports", view: "ledger" })}>View imports</button> : null}
      {canOpenWorkspaceRoute(session, { surface: "repricing-scope" }) ? <button className="ops-primary" type="button" onClick={() => onNavigate({ surface: "repricing-scope", resourceId: "new", view: "scope" })}><span>Start repricing</span><ArrowRight aria-hidden="true" /></button> : null}
    </ScreenHeader>
    <Surface surfaceRef={catalogSurfaceRef} className={`ops-split-surface catalog-split-surface catalog-ledger-compact${selected ? " has-peek" : ""}${modeClass}`} label="Catalog">
      <div className="ops-list-plane" aria-busy={paging} aria-hidden={inspectorOwnsSurface ? "true" : undefined} inert={inspectorOwnsSurface ? true : undefined}>
        <header className="ops-toolbar"><div><strong>{number(authoritativeCount)} SKUs</strong><span>{number(items.length)} on this page</span></div><label className="ops-search"><MagnifyingGlass aria-hidden="true" /><input aria-label="Search product or SKU code" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product or SKU code" /></label></header>
        <div className="catalog-header" aria-hidden="true"><span>Product and SKU code</span><span>Scope</span><span className="catalog-ledger-price-heading">Current price</span><span className="catalog-ledger-status-heading">Status</span></div>
        <div className="catalog-list">{items.map((item) => <button type="button" key={item.id} className={selected?.id === item.id ? "is-selected" : ""} aria-expanded={selected?.id === item.id} aria-controls={selected?.id === item.id ? "catalog-detail-peek" : undefined} onClick={(event) => openSelected(event, item)}>
          <span className="catalog-identity"><span><strong>{item.productName}</strong><small>{[item.variant, item.merchantSku ? `SKU ${item.merchantSku}` : null].filter(Boolean).join(" · ")}</small></span></span>
          <span className="catalog-scope">{item.scopeLabel ?? item.scope}</span>
          <span className="catalog-money"><strong>{item.priceLabel ?? item.price}</strong><small>Cost {item.costLabel ?? item.cost}</small></span>
          {item.statusTone === "success" ? <span className="catalog-status-current catalog-ledger-status"><CheckCircle aria-hidden="true" />{item.statusLabel}</span> : <span className="catalog-ledger-status"><StatusPill tone={item.statusTone}>{item.statusLabel}</StatusPill></span>}
          <CaretRight aria-hidden="true" />
        </button>)}</div>
        {!items.length ? <EmptyBoundary title="No catalog records match." detail="Change the search without changing the authoritative catalog." actionLabel="Clear search" onAction={() => setQuery("")} /> : null}
        {pageError ? <div className="cursor-pager-error" role="alert"><span>{pageError.error.message}</span><button type="button" onClick={() => pageRetryRef.current && loadPage(pageRetryRef.current)}>Retry page</button></div> : null}
        <CursorPager pageIndex={pageIndex} pageSize={pageData?.page?.limit ?? CATALOG_PAGE_LIMIT} returnedCount={items.length} matchedCount={sampleCount} authoritativeCount={authoritativeCount} itemLabel="SKUs" scopeLabel="authoritative SKUs" hasNext={Boolean(pageData?.page?.nextCursor)} busy={paging || queryPending} onPrevious={previousPage} onNext={nextPage} />
      </div>
      {selected && inspectorOwnsSurface ? <button type="button" className="ops-peek-scrim" tabIndex="-1" aria-hidden="true" onClick={closeSelected} /> : null}
      {selected ? <aside ref={selectedPeekRef} id="catalog-detail-peek" className="ops-peek" tabIndex="-1" aria-label={`Catalog detail for ${selected.productName}`} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeSelected(); } }}><header><div><div className="catalog-peek__context"><Eyebrow>CATALOG RECORD</Eyebrow><StatusPill tone={selected.statusTone}>{selected.statusLabel}</StatusPill></div><h2>{selected.productName}</h2><p>{selected.variant}</p></div><button type="button" className="ops-icon" onClick={closeSelected} aria-label="Close catalog detail"><X aria-hidden="true" /></button></header><div className="catalog-code"><small>Merchant SKU</small><strong>{selected.merchantSku}</strong><span>Organisation-scoped business identifier</span></div><dl className="ops-detail-grid"><div><dt>Channel and location</dt><dd>{selected.scopeLabel ?? selected.scope}</dd></div><div><dt>Current price</dt><dd>{selected.priceLabel ?? selected.price}</dd></div><div><dt>Current cost</dt><dd>{selected.costLabel ?? selected.cost}</dd></div><div><dt>Effective</dt><dd>{selected.effectiveAtLabel ?? selected.effectiveAt}</dd></div></dl><section className="identifier-list"><h3>Identifiers</h3>{list(selected.identifiers).map((identifier) => <div key={`${identifier.namespace}:${identifier.value}`}><span>{identifier.namespace}</span><strong>{identifier.value}</strong><em>{identifier.primary ? "Primary" : "Alias"}</em></div>)}</section><section className="peek-provenance"><span><small>Source record</small><strong>{selected.sourceLabel ?? selected.source}</strong><em>{selected.provenanceLabel ?? "Recorded from the trusted import boundary"}</em></span></section><button type="button" className="ops-secondary ops-full" onClick={() => onNavigate({ surface: "catalog-detail", resourceId: selected.id, view: "detail" })}>Open full record</button></aside> : null}
    </Surface>
  </>;
}

function CatalogDetailScreen({ data, onNavigate }) {
  const item = catalogView(data);
  const identifiers = list(item.identifiers).filter((identifier) => identifier.value);
  const StatusIcon = item.statusTone === "success" ? CheckCircle : Warning;
  return <article className="catalog-record">
    <button type="button" className="catalog-record-back" onClick={() => onNavigate({ surface: "catalog", view: "list" })}><ArrowLeft aria-hidden="true" />Catalog</button>
    <header className="catalog-record-heading">
      <div>
        <p className="catalog-record-context">Catalog record</p>
        <h1>{item.productName ?? "Catalog record"}</h1>
        <p className="catalog-record-subtitle"><span>{item.variant ?? "Variant unavailable"}</span><span>SKU code {item.merchantSku ?? "Unavailable"}</span></p>
      </div>
      <span className={`catalog-record-status is-${item.statusTone}`}><StatusIcon aria-hidden="true" />{item.statusLabel}</span>
    </header>
    <div className="catalog-record-sheet">
      <section className="catalog-record-pricing" aria-label="Price and cost record">
        <dl className="catalog-record-amounts">
          <div><dt>Current price</dt><dd className={!item.currentPrice ? "is-unavailable" : undefined}>{item.priceLabel}</dd></div>
          <div><dt>Current cost</dt><dd className={!item.currentCost ? "is-unavailable" : undefined}>{item.costLabel}</dd>{item.costState === "stale" ? <span className="catalog-record-cost-state">Cost is stale</span> : null}</div>
        </dl>
        <dl className="catalog-record-dates">
          <div><dt>Effective</dt><dd>{item.effectiveAt ? <time dateTime={item.effectiveAt}>{item.effectiveAtLabel}</time> : "No current price effective date"}</dd></div>
          <div><dt>Recorded</dt><dd>{item.source?.importedAt ? <time dateTime={item.source.importedAt}>{item.recordedAtLabel}</time> : "Unavailable"}</dd></div>
        </dl>
      </section>
      <section className="catalog-record-evidence" aria-label="Record evidence">
        <h2>Identity and source</h2>
        <dl className="catalog-record-facts">
          {identifiers.map((identifier) => <div key={`${identifier.namespace}:${identifier.value}`}><dt>{identifier.namespace}</dt><dd><span>{identifier.value}</span><small>{identifier.primary ? "Primary" : "Alias"}</small></dd></div>)}
          {item.category?.name ? <div><dt>Category</dt><dd>{item.category.name}</dd></div> : null}
          <div><dt>Channel</dt><dd>{item.channel?.name ?? "Unavailable"}</dd></div>
          <div><dt>Location</dt><dd>{item.location?.name ?? "Unavailable"}</dd></div>
          <div><dt>Source</dt><dd>{item.source?.fileName ? item.sourceLabel : "Unavailable"}</dd></div>
        </dl>
      </section>
      <p className="catalog-record-readonly">This record is read-only. Price changes go through repricing and approval.</p>
    </div>
  </article>;
}

function ImportsLedger({ data, onNavigate }) {
  const [query, setQuery] = useState("");
  const items = list(data?.items);
  const shown = items.filter((item) => !query || `${item.sourceFile?.name ?? ""} ${item.title ?? ""} ${item.stage ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const stageLabels = { upload: "Choose source", profile: "Profile source", map: "Field mapping", validate: "Validation", review: "Review import", commit: "Commit status", result: "Reconciled result" };
  return <>
    <ScreenHeader eyebrow="IMPORTS" title="Imports" description="Validate and reconcile every row.">
      <button className="ops-primary" type="button" onClick={() => onNavigate({ surface: "import-new", view: "create" })}><UploadSimple aria-hidden="true" /><span>Create sample import</span></button>
    </ScreenHeader>
    <Surface label="Import ledger"><header className="ops-toolbar"><div><strong>{items.length} import batches</strong><span>Source, progress and row reconciliation</span></div><label className="ops-search"><MagnifyingGlass aria-hidden="true" /><input aria-label="Search imports" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search imports" /></label></header><div className="import-ledger"><div className="import-ledger__head"><span>Import batch</span><span>Progress</span><span>Row accounting</span><span>Owner</span><span>Updated</span><span /></div>{shown.map((item) => <button type="button" key={item.ref.id} onClick={() => onNavigate({ surface: `import-${item.stage}`, resourceId: item.ref.id, resourceVersion: item.ref.version, view: item.stage })}><span className="import-file"><span><strong>{item.title ?? "Import batch"}</strong><small>{item.sourceFile?.name ?? "Source not selected"} · {item.sourceFile?.format ?? "Format unavailable"}</small></span></span><StatusPill tone={item.state === "committed" ? "success" : item.state === "partial-success" || item.state === "needs-attention" ? "attention" : "neutral"}>{stageLabels[item.stage] ?? humanise(item.stage)}</StatusPill><span className="import-counts"><strong>{number(item.counts?.input)} input</strong><small>{number(item.counts?.valid ?? item.counts?.committed)} clear · {number(item.counts?.invalid ?? item.counts?.rejected)} require action</small></span><span className="import-ledger__owner"><small>Owner</small><strong>{shortActorName(item.owner?.displayName ?? "Owner unavailable")}</strong></span><span className="import-ledger__updated"><small>Updated</small><strong>{dateTime(item.updatedAt)}</strong></span><CaretRight aria-hidden="true" /></button>)}</div>{!shown.length ? <EmptyBoundary title="No imports match this search." detail="Clear the search to restore the import ledger." actionLabel="Clear search" onAction={() => setQuery("")} /> : null}</Surface>
  </>;
}

function ImportActionError({ error }) {
  if (!error) return null;
  return <div className="upload-boundary" role="alert"><ShieldWarning aria-hidden="true" /><span><strong>This step could not complete</strong><small>{error.error.message} · Reference: {error.error.code}</small></span></div>;
}

function ImportCreate({ repositories, onNavigate }) {
  const [intent, setIntent] = useState("cost-update");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey] = useState(() => importRequestKey("create"));
  const intents = [["catalog-bootstrap", "New catalog", "Add product records and SKU codes."], ["cost-update", "Cost update", "Match SKU codes to supplier costs."], ["price-update", "Price-list update", "Review prices from an external list."], ["mixed-update", "Mixed update", "Review products, costs and prices together."]];
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await repositories.imports.create({ intent, idempotencyKey });
      onNavigate({ surface: "import-upload", resourceId: result.data.ref.id, resourceVersion: result.data.ref.version, view: "upload" });
    } catch (caught) {
      setError(toDomainErrorEnvelope(caught, "import-create"));
    } finally {
      setBusy(false);
    }
  };
  return <>
    <ScreenHeader eyebrow="SAMPLE IMPORT" title="Start an import" description="Choose what to import, then select a source." />
    <div className="import-create-layout"><Surface label="Import intent"><header className="ops-section-head"><span>01</span><div><Eyebrow>IMPORT INTENT</Eyebrow><h2>Choose an import type</h2></div></header><div className="intent-grid">{intents.map(([id, title, detail]) => <button type="button" key={id} className={intent === id ? "is-selected" : ""} onClick={() => setIntent(id)} aria-pressed={intent === id}><span>{intent === id ? <Check aria-hidden="true" /> : null}</span><strong>{title}</strong><small>{detail}</small></button>)}</div></Surface><Surface label="Sample data boundary"><header className="ops-section-head"><span>02</span><div><Eyebrow>CREATE BATCH</Eyebrow><h2>Ready to start</h2></div></header><div className="upload-boundary"><Info aria-hidden="true" /><span><strong>Try the sample workflow</strong><small>Use a supplied CSV to review mapping and row outcomes. Nothing is uploaded from your device or written to the live Catalog. Progress lasts only for this sample session.</small></span></div><div className="profile-facts"><div><small>Data</small><strong>Sample CSV</strong></div><div><small>Live changes</small><strong>None</strong></div><div><small>Next step</small><strong>Choose source</strong></div><div><small>Traceability</small><strong>Versioned batch</strong></div></div><ImportActionError error={error} /><button type="button" className="ops-primary ops-full" disabled={busy} onClick={create}><span>{busy ? "Creating sample batch…" : "Create sample import"}</span><ArrowRight aria-hidden="true" /></button></Surface></div>
  </>;
}

function ImportUploadStage({ data, repositories, onNavigate }) {
  const uploadAction = list(data?.allowedActions).find((item) => item.code === "import.upload");
  const sourceAlreadyRecorded = data?.sourceFile?.name && data.sourceFile.name !== "No sample source selected";
  const [selected, setSelected] = useState(Boolean(sourceAlreadyRecorded));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey] = useState(() => importRequestKey("upload", data?.ref?.version));
  const upload = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await repositories.imports.upload({
        batchRef: data.ref,
        sourceFile: { name: "owomide-fixture-supplier-costs-messy.csv", format: "CSV", rows: 80, isSynthetic: true },
        idempotencyKey,
      });
      onNavigate({ surface: "import-profile", resourceId: result.data.ref.id, resourceVersion: result.data.ref.version, view: "profile" });
    } catch (caught) {
      setError(toDomainErrorEnvelope(caught, "import-upload"));
    } finally {
      setBusy(false);
    }
  };
  return <div className="import-create-layout import-upload-layout"><Surface label="Source file"><header className="ops-section-head"><span>01</span><div><Eyebrow>SOURCE FILE</Eyebrow><h2>Choose the sample source</h2></div></header><button type="button" className={`upload-well${selected ? " is-selected" : ""}`} disabled={!uploadAction?.enabled} onClick={() => setSelected((current) => !current)}><span>{selected ? <FileXls aria-hidden="true" /> : <UploadSimple aria-hidden="true" />}</span><strong>{selected ? "owomide-fixture-supplier-costs-messy.csv" : "Choose the CSV sample"}</strong><small>{selected ? "80 rows · CSV" : "Supplied sample · no file upload"}</small><em>{uploadAction?.enabled ? selected ? "Replace sample" : "Select sample file" : "Source already recorded"}</em></button></Surface><Surface label="Upload boundary"><header className="ops-section-head"><span>02</span><div><Eyebrow>SOURCE DETAILS</Eyebrow><h2>Review before profiling</h2></div></header><div className="upload-boundary"><Info aria-hidden="true" /><span><strong>Sample data only</strong><small>The supplied CSV will be attached to batch version {data?.ref?.version}. No local file is uploaded and no live Catalog record changes.</small></span></div><div className="profile-facts"><div><small>Accepted sample</small><strong>CSV</strong></div><div><small>Rows</small><strong>80</strong></div><div><small>Storage</small><strong>Sample session</strong></div><div><small>Next stage</small><strong>Profile</strong></div></div><ImportActionError error={error} /><button type="button" className="ops-primary ops-full import-upload-layout__action" disabled={!selected || !uploadAction?.enabled || busy} onClick={upload}><span>{busy ? "Recording sample source…" : "Record sample source"}</span><ArrowRight aria-hidden="true" /></button></Surface></div>;
}

function MappingTable({ mappings, reviewed = false, reviewContext = null, savedTemplate = null }) {
  const rows = reviewed && reviewContext?.effectiveAt
    ? [...list(mappings), { source: reviewContext.source ?? "Import context", examples: [formatEffectiveAt(reviewContext.effectiveAt)], target: "effectiveAt", targetLabel: "Effective time", required: true, confidenceBasisPoints: null, transform: "Organisation timezone · Africa/Lagos" }]
    : list(mappings);
  return <div className="mapping-table"><div className="mapping-head"><span>Source field and examples</span><span>Canonical target</span><span>Confidence</span><span>Transform</span></div>{rows.map((mapping) => {
    const confidence = Number.isFinite(mapping.confidenceBasisPoints) ? Math.round(mapping.confidenceBasisPoints / 100) : null;
    const suggestedTarget = mapping.source === "Trade Cost" ? "Current cost" : mapping.source === "Price?" ? "Current price" : "Target unavailable";
    const target = mapping.targetLabel ?? mapping.target ?? suggestedTarget;
    return <div className={!mapping.target ? "is-blocked" : ""} key={mapping.source}><span className="mapping-field" data-label="Source field"><strong>{mapping.source}</strong><small>{list(mapping.examples).join(" · ")}</small></span><span className="mapping-target" data-label="Canonical target"><small>{!mapping.target ? "Suggested · " : ""}{mapping.required ? "Required" : "Optional"}</small><strong>{target}</strong>{!mapping.target ? <em>Needs confirmation</em> : mapping.target === "merchantSku" ? <em>Organisation-scoped SKU code</em> : reviewed ? <em>Confirmed mapping</em> : null}</span><span className="mapping-confidence" data-label="Confidence"><StatusPill tone={confidence == null ? "neutral" : confidence >= 90 ? "success" : confidence < 60 ? "danger" : "attention"}>{confidence == null ? "Not scored" : `${confidence}% match`}</StatusPill></span><span className="mapping-transform" data-label="Transform"><strong>{mapping.transform ?? "No transform"}</strong><small>{savedTemplate ? `${savedTemplate.name} · v${savedTemplate.version}` : "Supplied sample mapping"}</small></span></div>;
  })}</div>;
}

function ImportJourney({ data, route, repositories, onNavigate }) {
  const [busyAction, setBusyAction] = useState(null);
  const [error, setError] = useState(null);
  const requestKeys = useRef(new Map());
  const journeyRef = useRef(null);
  const batchId = route.resourceId;
  const stage = route.surface.replace("import-", "");
  const stageDataKey = stage === "map" ? "mapping" : stage === "validate" ? "validation" : stage;
  const current = data?.[stageDataKey] ?? data?.stages?.find?.((item) => item.id === stage) ?? {};
  const actionFor = (code) => list(data?.allowedActions).find((item) => item.code === code);
  const keyFor = (code) => {
    const key = `${code}:${data?.ref?.version}`;
    if (!requestKeys.current.has(key)) requestKeys.current.set(key, importRequestKey(code, data?.ref?.version));
    return requestKeys.current.get(key);
  };
  const navigateJourney = (journey, next, operation = null) => onNavigate({
    surface: `import-${next}`,
    resourceId: journey.ref.id,
    resourceVersion: journey.ref.version,
    operationId: operation?.ref?.id ?? (next === "commit" ? journey.commit?.operationRef?.id : null),
    operationVersion: operation?.ref?.version ?? (next === "commit" ? journey.commit?.operationRef?.version : null),
    view: next,
  });
  const go = (next) => {
    navigateJourney(data, next, next === "commit" ? data?.commit?.operation : null);
  };
  const mutate = async (code, operation, onSuccess) => {
    setBusyAction(code);
    setError(null);
    try {
      const result = await operation(keyFor(code));
      onSuccess(result);
    } catch (caught) {
      setError(toDomainErrorEnvelope(caught, `operational-${code}`));
    } finally {
      setBusyAction(null);
    }
  };
  const profiled = data?.stage !== "profile" || data?.state !== "uploaded";
  const mappingReviewed = Number(data?.mapping?.ambiguityCount ?? 0) === 0 && list(data?.mapping?.unmappedRequired).length === 0;
  const profileAction = actionFor("import.profile");
  const saveMappingAction = actionFor("import.mapping.save");
  const validateAction = actionFor("import.validate");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const journey = journeyRef.current;
      journey?.focus?.({ preventScroll: true });
      if (typeof journey?.scrollIntoView === "function") {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        journey.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [data?.ref?.version, stage]);
  return <section ref={journeyRef} className="import-journey" aria-label={`Import ${humanise(stage)} stage`} tabIndex="-1">
    <button type="button" className="ops-back" onClick={() => onNavigate({ surface: "imports", view: "ledger" })}><ArrowLeft aria-hidden="true" />Import ledger</button>
    <ScreenHeader eyebrow="IMPORT BATCH" title={data?.title ?? "Sample import"} description={`${data?.sourceFile?.name ?? "No source selected"} · Sample only · Catalog unchanged`} meta={<><span>Batch {batchId}</span><span>Version {data?.ref?.version}</span></>} />
    <StageRail current={stage} reached={data?.stage} batchRef={data?.ref} operationRef={data?.commit?.operationRef} onNavigate={onNavigate} />
    {stage === "upload" ? <ImportUploadStage data={data} repositories={repositories} onNavigate={onNavigate} /> : null}
    {stage === "profile" ? <Surface label="Profiled source"><div className="profile-layout"><section><header className="ops-section-head"><span>02</span><div><Eyebrow>{profiled ? "PROFILE COMPLETE" : "PROFILE SOURCE"}</Eyebrow><h2>{profiled ? "Source profile ready" : "Check the source structure"}</h2></div></header><div className="profile-file"><span><strong>{data?.sourceFile?.name ?? "Sample source"}</strong><small>{number(current.rows ?? 80)} data rows · {number(current.columns ?? 7)} columns · {number(current.sheets ?? 1)} worksheet</small></span><StatusPill tone={profiled ? "success" : "attention"}>{profiled ? "Profiled" : "Ready to profile"}</StatusPill></div><div className="profile-facts"><div><small>Detected currency</small><strong>NGN</strong></div><div><small>Date pattern</small><strong>DD MMM YYYY</strong></div><div><small>Header row</small><strong>Row 1</strong></div><div><small>Source</small><strong>Sample CSV</strong></div></div></section><aside><Eyebrow>SOURCE SAMPLE</Eyebrow><div className="source-sample"><span>Stock Ref</span><span>Item</span><span>Trade Cost</span><strong>KLD-PANT-0032</strong><strong>Cassava flour 1 kg</strong><strong>1515.50</strong><strong>KLD-PANT-0002</strong><strong>Long-grain rice 1 kg</strong><strong>547.50</strong></div><div className="upload-boundary"><Info aria-hidden="true" /><span><strong>SKU code identified</strong><small>Stock Ref appears to contain your SKU codes. Confirm the mapping before validation.</small></span></div></aside></div><ImportActionError error={error} /><footer className="ops-sticky-actions"><button type="button" className="ops-secondary" onClick={() => go("upload")}>View source</button><button type="button" className="ops-primary" disabled={Boolean(busyAction)} onClick={() => profileAction?.enabled ? mutate("profile", (idempotencyKey) => repositories.imports.profile({ batchRef: data.ref, idempotencyKey }), (result) => navigateJourney(result.data, "profile")) : go("map")}><span>{busyAction === "profile" ? "Profiling sample…" : profileAction?.enabled ? "Profile sample source" : "Review field mapping"}</span><ArrowRight aria-hidden="true" /></button></footer></Surface> : null}
    {stage === "map" ? <Surface label="Field mapping"><header className="ops-section-head ops-section-head--wide"><span>03</span><div><Eyebrow>FIELD MAPPING</Eyebrow><h2>Match fields to the Catalog</h2><p>Review the supplied field matches. Custom mappings and file uploads are not available in this sample.</p></div><StatusPill tone={mappingReviewed ? "success" : current.unmappedRequired?.length ? "danger" : "attention"}>{mappingReviewed ? "Saved" : current.unmappedRequired?.length ? `${current.unmappedRequired.length} required field` : "Review mapping"}</StatusPill></header><MappingTable mappings={current.rows} reviewed={mappingReviewed} reviewContext={current.reviewContext} savedTemplate={current.savedTemplate} /><div className="mapping-boundary"><LinkSimple aria-hidden="true" /><span><strong>Mapping template</strong><small>{current.savedTemplate?.name ?? "Supplier cost template"} · version {current.savedTemplate?.version ?? "draft"} · Sample data</small></span>{saveMappingAction?.enabled ? <button type="button" className="ops-secondary" disabled={Boolean(busyAction)} onClick={() => mutate("mapping", (idempotencyKey) => repositories.imports.saveMapping({ batchRef: data.ref, mapping: { tradeCostTarget: "cost.amountMinor", priceTarget: "price.amountMinor", effectiveAt: "2026-08-15T00:00:00+01:00" }, idempotencyKey }), (result) => navigateJourney(result.data, "map"))}>{busyAction === "mapping" ? "Saving reviewed mapping…" : "Use reviewed sample mapping"}</button> : <span className="mapping-reviewed"><CheckCircle aria-hidden="true" />Required fields are ready for validation</span>}</div><ImportActionError error={error} /><footer className="ops-sticky-actions"><button type="button" className="ops-secondary" onClick={() => go("profile")}>Back to profile</button><button type="button" className="ops-primary" disabled={!validateAction?.enabled || Boolean(busyAction)} onClick={() => mutate("validate", (idempotencyKey) => repositories.imports.validate({ batchRef: data.ref, idempotencyKey }), (result) => navigateJourney(result.data, "validate"))}><span>{busyAction === "validate" ? "Validating sample rows…" : `Validate ${number(data?.profile?.rows)} rows`}</span><ArrowRight aria-hidden="true" /></button></footer></Surface> : null}
    {stage === "validate" ? <ValidationScreen current={current} data={data} onBack={() => go("map")} onContinue={() => go("review")} /> : null}
    {stage === "review" ? <ImportReview current={current} data={data} busy={busyAction === "review"} error={error} onBack={() => go("validate")} onContinue={(acknowledgement) => mutate("review", (idempotencyKey) => repositories.imports.acknowledgeReview({ batchRef: data.ref, acknowledgement, idempotencyKey }), (result) => navigateJourney(result.data, "commit"))} /> : null}
    {stage === "commit" ? <ImportCommit current={current} data={data} busyAction={busyAction} error={error} onBack={() => go("review")} onCommit={() => mutate("commit", (idempotencyKey) => repositories.imports.commit({ batchRef: data.ref, idempotencyKey }), (result) => navigateJourney(result.data.journey, "commit", result.data.operation))} onReconcile={() => mutate("reconcile", (idempotencyKey) => repositories.imports.reconcileCommit({ operationRef: data.commit.operation.ref, idempotencyKey }), (result) => navigateJourney(result.data.journey, "result", result.data.operation))} /> : null}
    {stage === "result" ? <ImportResult current={current} data={data} onNavigate={onNavigate} /> : null}
  </section>;
}

function ValidationScreen({ current, data, onBack, onContinue }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const selectedOriginRef = useRef(null);
  const issuePeekRef = useRef(null);
  const issues = list(current.issues ?? data?.issues);
  const shown = filter === "all" ? issues : issues.filter((issue) => issue.severity === filter);
  const counts = current.counts ?? data?.counts ?? { input: 1248, valid: 1227, warning: 9, invalid: 12, excluded: 0 };
  const rowNumber = (issue) => issue.rowNumber ?? issue.row ?? "Unknown";
  const closeSelected = () => {
    setSelected(null);
    window.requestAnimationFrame(() => selectedOriginRef.current?.focus?.());
  };
  const openSelected = (event, issue) => {
    selectedOriginRef.current = event.currentTarget;
    setSelected(issue);
  };
  useEffect(() => {
    if (!selected) return undefined;
    const frame = window.requestAnimationFrame(() => issuePeekRef.current?.focus?.({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);
  return <Surface className={`ops-split-surface${selected ? " has-peek" : ""}`} label="Validation and repair">
    <div className="ops-list-plane">
      <header className="ops-section-head ops-section-head--wide"><span>04</span><div><Eyebrow>VALIDATE AND REPAIR</Eyebrow><h2>Review row issues</h2><p>Check the affected field and reason. No source rows are dropped.</p></div><StatusPill tone="danger">{number(counts.invalid)} blocking</StatusPill></header>
      <div className="reconciliation-equation" aria-label="Validation row reconciliation"><div><small>Input</small><strong>{number(counts.input)}</strong></div><i>=</i><div><small>Attempted</small><strong>{number(counts.valid)}</strong></div><i>+</i><div className="is-danger"><small>Unresolved</small><strong>{number(counts.invalid)}</strong></div><i>+</i><div><small>Excluded</small><strong>{number(counts.excluded)}</strong></div><span>{number(counts.warning)} warnings remain inside the attempted set</span></div>
      <div className="issue-toolbar"><div>{[["all", "All issues"], ["error", "Errors"], ["warning", "Warnings"]].map(([id, label]) => <button type="button" key={id} className={filter === id ? "is-active" : ""} aria-pressed={filter === id} onClick={() => { setSelected(null); setFilter(id); }}>{label}</button>)}</div><span>{shown.length} sample issues · totals cover the full batch</span></div>
      <div className="issue-list">{shown.map((issue) => <button type="button" key={issue.rowId ?? `${issue.code}:${rowNumber(issue)}`} className={selected?.rowId === issue.rowId ? "is-selected" : ""} aria-expanded={selected?.rowId === issue.rowId} aria-controls={selected?.rowId === issue.rowId ? "import-issue-inspector" : undefined} onClick={(event) => openSelected(event, issue)}><span className={`issue-mark is-${issue.severity}`}><Warning aria-hidden="true" /></span><span><strong>Row {rowNumber(issue)} · {issue.fieldLabel ?? issue.field}</strong><small>{issue.code}</small></span><span className="issue-raw"><small>Source value</small><strong>Not available in sample</strong></span><span className="issue-reason">{issue.message}</span><CaretRight aria-hidden="true" /></button>)}</div>
      <footer className="ops-sticky-actions"><button type="button" className="ops-secondary" onClick={onBack}>Back to mapping</button><button type="button" className="ops-primary" onClick={onContinue}><span>Review import</span><ArrowRight aria-hidden="true" /></button></footer>
    </div>
    {selected ? <aside ref={issuePeekRef} id="import-issue-inspector" className="ops-peek issue-peek" tabIndex="-1" aria-label={`Issue detail for row ${rowNumber(selected)}`} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeSelected(); } }}><header><div><Eyebrow>{selected.severity === "error" ? "BLOCKING ISSUE" : "WARNING"}</Eyebrow><h2>Row {rowNumber(selected)}</h2><p>{selected.code}</p></div><button type="button" className="ops-icon" onClick={closeSelected} aria-label="Close issue detail"><X aria-hidden="true" /></button></header><dl className="issue-detail"><div><dt>Source field</dt><dd>{selected.fieldLabel ?? selected.field}</dd></div><div><dt>Raw value</dt><dd>Not available in this sample</dd></div><div><dt>Canonical target</dt><dd>{selected.field}</dd></div><div><dt>Reason</dt><dd>{selected.message}</dd></div></dl><div className="repair-suggestion"><PencilSimple aria-hidden="true" /><span><small>Next step</small><strong>Correct the source value or exclude the row with a reason. These edits are not enabled in this sample.</strong></span></div><button type="button" className="ops-primary ops-full" disabled title="Row repair is not available in this sample"><span>Repair unavailable in sample</span><LockKey aria-hidden="true" /></button><button type="button" className="ops-secondary ops-full" disabled title="Row exclusion is not available in this sample">Exclude with reason</button></aside> : null}
  </Surface>;
}

function ImportReview({ current, data, busy, error, onBack, onContinue }) {
  const [confirmed, setConfirmed] = useState(false);
  const counts = current.counts ?? data?.counts ?? { input: 1248, valid: 1227, warning: 9, invalid: 12, excluded: 12 };
  const remaining = counts.remaining ?? counts.invalid ?? 0;
  return <Surface label="Import review"><header className="ops-section-head ops-section-head--wide"><span>05</span><div><Eyebrow>REVIEW IMPORT</Eyebrow><h2>Confirm the rows to import</h2><p>Check the mapping and unresolved rows before continuing.</p></div><StatusPill tone={remaining ? "attention" : "success"}>{remaining ? "Unresolved rows retained" : "Ready"}</StatusPill></header><div className="review-document"><section><Eyebrow>SOURCE AND MAPPING</Eyebrow><h3>{data?.sourceFile?.name ?? "Sample source"}</h3><dl><div><dt>Import intent</dt><dd>{data?.title ?? "Sample import"}</dd></div><div><dt>Mapping</dt><dd>{data?.mapping?.savedTemplate?.name ?? "Reviewed source mapping"} v{data?.mapping?.savedTemplate?.version ?? data?.ref?.version}</dd></div><div><dt>Source rows</dt><dd>{number(counts.input)}</dd></div><div><dt>Prepared by</dt><dd>{data?.owner?.displayName ?? "Preparer unavailable"}</dd></div></dl></section><section><Eyebrow>EXPECTED CONSEQUENCE</Eyebrow><h3>{number(counts.valid)} rows ready to attempt</h3><dl><div><dt>Attempted</dt><dd>{number(counts.valid)}</dd></div><div><dt>Warnings retained</dt><dd>{number(counts.warning)}</dd></div><div><dt>Excluded before attempt</dt><dd>{number(counts.excluded)}</dd></div><div><dt>Unresolved input</dt><dd>{number(remaining)}</dd></div></dl></section></div><div className="review-consequence"><ShieldWarning aria-hidden="true" /><span><strong>Commit only the {number(counts.valid)} reviewed rows.</strong><small>{number(remaining)} unresolved rows and {number(counts.excluded)} exclusions remain accounted for. Confirmation opens a separate Commit step; it does not start the import.</small></span></div><label className="risk-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>I reviewed the mapping, warnings, exclusions and unresolved input.</strong><small>Record my acknowledgement for this batch version.</small></span></label><ImportActionError error={error} /><footer className="ops-sticky-actions"><button type="button" className="ops-secondary" onClick={onBack}>Back to validation</button><button type="button" className="ops-primary" disabled={!confirmed || busy} onClick={() => onContinue(true)}><span>{busy ? "Recording acknowledgement…" : "Confirm and continue"}</span><ArrowRight aria-hidden="true" /></button></footer></Surface>;
}

function ImportCommit({ current, data, busyAction, error, onBack, onCommit, onReconcile }) {
  const operation = current?.operation ?? data?.commit?.operation ?? null;
  const ready = data?.state === "ready-to-commit";
  const awaiting = operation?.state === "unknown-outcome" || data?.state === "awaiting-reconciliation";
  const attempted = operation?.counts?.attempted ?? data?.result?.counts?.attempted ?? data?.review?.counts?.valid ?? 0;
  const pending = "Pending reconciliation";
  return <Surface label="Sample data commit"><header className="ops-section-head ops-section-head--wide"><span>06</span><div><Eyebrow>COMMIT AND STATUS</Eyebrow><h2>{ready ? "Commit the reviewed rows" : "Check the import outcome"}</h2><p>One operation per confirmed batch version. The original idempotency key prevents a second commit.</p></div><StatusPill tone={awaiting ? "attention" : "success"}>{ready ? "Ready" : "Outcome unknown"}</StatusPill></header><div className="review-document"><section><Eyebrow>CONFIRMED BATCH</Eyebrow><h3>Batch version {data?.ref?.version}</h3><dl><div><dt>Data</dt><dd>Sample CSV</dd></div><div><dt>Attempted rows</dt><dd>{number(attempted)}</dd></div><div><dt>Acknowledgement</dt><dd>{data?.review?.acknowledgement?.acknowledged ? "Recorded" : "Required"}</dd></div><div><dt>Live Catalog</dt><dd>Unchanged</dd></div></dl></section><section><Eyebrow>OPERATION STATUS</Eyebrow><h3>{operation ? "Commit started" : "Not started"}</h3><dl><div><dt>State</dt><dd>{operation ? humanise(operation.state) : "Ready to start"}</dd></div><div><dt>Operation ID</dt><dd>{operation?.ref?.id ?? "Not assigned"}</dd></div><div><dt>Operation version</dt><dd>{operation?.ref?.version ?? "Not assigned"}</dd></div><div><dt>Stored in</dt><dd>Sample session only</dd></div><div><dt>Next step</dt><dd>{operation ? "Reconciliation" : "Commit"}</dd></div></dl></section></div>{operation ? <div className="result-counts" aria-label="Pending Sample data operation counts"><div><small>Attempted</small><strong>{number(attempted)}</strong></div><div className={operation.counts.committed == null ? "is-pending" : ""}><small>Committed</small><strong>{operation.counts.committed == null ? pending : number(operation.counts.committed)}</strong></div><div className={operation.counts.rejected == null ? "is-pending" : ""}><small>Rejected</small><strong>{operation.counts.rejected == null ? pending : number(operation.counts.rejected)}</strong></div><div className={operation.counts.remaining == null ? "is-pending" : ""}><small>Remaining input</small><strong>{operation.counts.remaining == null ? pending : number(operation.counts.remaining)}</strong></div></div> : null}<div className="review-consequence"><Info aria-hidden="true" /><span><strong>{ready ? "Confirm the outcome after committing." : "The outcome is not confirmed yet."}</strong><small>{ready ? "This sample first returns an unknown outcome. Reconcile the same operation to confirm accepted and rejected rows." : "Reconcile this operation before starting anything else. Do not repeat the commit."}</small></span></div><ImportActionError error={error} /><footer className="ops-sticky-actions"><button type="button" className="ops-secondary" onClick={onBack}>Back to review</button>{ready ? <button type="button" className="ops-primary" disabled={Boolean(busyAction)} onClick={onCommit}><span>{busyAction === "commit" ? "Starting sample operation…" : "Start sample commit"}</span><ArrowRight aria-hidden="true" /></button> : awaiting ? <button type="button" className="ops-primary" disabled={Boolean(busyAction)} onClick={onReconcile}><span>{busyAction === "reconcile" ? "Reconciling operation…" : "Reconcile sample operation"}</span><ArrowRight aria-hidden="true" /></button> : null}</footer></Surface>;
}

function ImportResult({ current, data, onNavigate }) {
  const counts = current.counts ?? data?.result?.counts ?? { attempted: 1236, committed: 1227, rejected: 9, remaining: 9 };
  const partial = Number(counts.rejected ?? counts.remaining) > 0;
  return <Surface label="Import result"><div className="result-hero"><span className={partial ? "is-attention" : "is-success"}>{partial ? <Warning aria-hidden="true" /> : <SealCheck aria-hidden="true" />}</span><Eyebrow>{partial ? "SAMPLE DATA · PARTIAL RESULT" : "SAMPLE DATA · RECONCILED"}</Eyebrow><h2>{partial ? "Import complete with exceptions" : "Import reconciled"}</h2><p>Operation {current.operationId ?? data?.operationId ?? "Unavailable"} · Sample result</p></div><div className="result-counts"><div><small>Attempted</small><strong>{number(counts.attempted)}</strong></div><div><small>Committed in sample</small><strong>{number(counts.committed)}</strong></div><div className={partial ? "is-danger" : ""}><small>Rejected</small><strong>{number(counts.rejected)}</strong></div><div><small>Remaining input</small><strong>{number(counts.remaining)}</strong></div></div>{partial ? <div className="persistent-recovery"><ShieldWarning aria-hidden="true" /><span><strong>{number(counts.rejected)} attempted rows were rejected and {number(counts.remaining)} source rows remain unresolved.</strong><small>Accepted rows will not be retried. Review unresolved source rows below. Live retry and export are not available in this sample.</small></span><button type="button" onClick={() => onNavigate({ surface: "import-validate", resourceId: data?.ref?.id ?? "FX-003", resourceVersion: data?.ref?.version, view: "validate" })}>Review unresolved input</button></div> : null}<div className="result-next"><button type="button" className="ops-secondary" onClick={() => onNavigate({ surface: "imports", view: "ledger" })}>Return to ledger</button><button type="button" className="ops-primary" onClick={() => onNavigate({ surface: "catalog", view: "list" })}><span>Open catalog</span><ArrowRight aria-hidden="true" /></button></div></Surface>;
}

function ScopeScreen({ data, repricing, onNavigate }) {
  const [persisted, setPersisted] = useState(data);
  const [title, setTitle] = useState(data?.title ?? "August cost recovery");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState(null);
  useEffect(() => {
    setPersisted(data);
    setTitle(data?.title ?? "August cost recovery");
    setMutationError(null);
  }, [data?.ref?.id, data?.ref?.version]);
  const counts = persisted?.counts ?? { matched: 1248, priced: 1239, unpriced: 9, eligible: 1210, excluded: 12, blocked: 17, selected: 1227, total: 1248 };
  const channels = list(persisted?.dimensions?.channels);
  const locations = list(persisted?.dimensions?.locations);
  const createAction = list(persisted?.allowedActions).find((action) => action.code === "repricing.scope.create");
  const updateAction = list(persisted?.allowedActions).find((action) => action.code === "repricing.scope.update");
  const ruleAction = list(persisted?.allowedActions).find((action) => action.code === "repricing.rule.read");
  const ruleTarget = ruleAction?.targetRef;
  const needsCreate = Boolean(createAction?.enabled);
  const dirty = title.trim() !== persisted?.title;
  const valid = Boolean(title.trim()) && title.trim().length <= 120;
  const persistScope = async () => {
    setBusy(true);
    setMutationError(null);
    try {
      const common = {
        title: title.trim(),
        filters: persisted.filters,
        selection: persisted.selection,
      };
      const result = needsCreate
        ? await repricing.createScope({ ...common, idempotencyKey: `rpr-scope-create:${persisted.ref.id}:v${persisted.ref.version}` })
        : await repricing.updateScope({ ...common, scopeRef: persisted.ref, idempotencyKey: `rpr-scope-update:${persisted.ref.id}:v${persisted.ref.version}` });
      setPersisted(result.data);
      setTitle(result.data.title);
    } catch (error) {
      setMutationError(toDomainErrorEnvelope(error, "repricing-scope-persist"));
    } finally {
      setBusy(false);
    }
  };
  return <>
    <ScreenHeader eyebrow="REPRICING · SCOPE" title="Define scope" description="Name this prepared sample. Its catalog population is fixed." />
    <div className="builder-layout"><Surface label="Prepared scope criteria"><header className="ops-section-head"><span>01</span><div><Eyebrow>{needsCreate ? "PREPARED SCOPE" : "PERSISTED SCOPE"}</Eyebrow><h2>One exact population.</h2></div></header><label className="rule-date"><span>Scope name</span><input value={title} maxLength={120} disabled={busy || (!needsCreate && !updateAction?.enabled)} onChange={(event) => setTitle(event.target.value)} /></label><div className="scope-persisted"><section><small>Category</small><strong>All active categories</strong><span>{number(persisted?.dimensions?.categoryCount)} categories</span></section><section><small>Channels</small><strong>All configured channels</strong><span>{channels.map((item) => item.name).join(" · ")}</span></section><section><small>Locations</small><strong>All configured locations</strong><span>{locations.map((item) => item.name).join(" · ")}</span></section><section><small>Record boundary</small><strong>Active · NGN</strong><span>Explicit exclusions stay outside selection</span></section></div><div className="scope-truth"><LockKey aria-hidden="true" /><span><strong>{needsCreate ? "Prepared sample · not yet persisted" : `Scope version ${persisted?.ref?.version ?? "current"}`}</strong><small>{needsCreate ? "Persisting records this exact population and its bound adjustment." : "This sample keeps its prepared dimensions and evidence together."}</small></span></div>{mutationError ? <div className="rule-dirty" role="alert"><ShieldWarning aria-hidden="true" /><span><strong>Scope not saved.</strong><small>{mutationError.error.message}</small></span></div> : null}{needsCreate || dirty ? <button type="button" className="ops-primary ops-full" disabled={busy || !valid || (!needsCreate && !updateAction?.enabled)} onClick={persistScope}><span>{busy ? "Saving scope…" : needsCreate ? "Save prepared scope" : "Save scope version"}</span><ArrowRight aria-hidden="true" /></button> : null}</Surface><Surface className="scope-accounting" label="Complete population"><header><Eyebrow>POPULATION ACCOUNTING</Eyebrow><h2>{number(counts.total)} catalog lines</h2><p>Exact prepared evidence for FX-004.</p></header><div className="scope-ledger"><div><span>Matched</span><strong>{number(counts.matched)}</strong></div><div><span>Priced</span><strong>{number(counts.priced)}</strong></div><div><span>Unpriced</span><strong>{number(counts.unpriced)}</strong></div><div><span>Excluded</span><strong>{number(counts.excluded)}</strong></div></div><div className="selected-population"><CheckCircle aria-hidden="true" /><span><small>Selected population</small><strong>{number(counts.selected)} lines</strong><em>{number(counts.priced)} priced − {number(counts.excluded)} excluded</em></span></div><div className="rule-dirty"><Info aria-hidden="true" /><span><strong>Prior preview evidence</strong><small>{number(counts.eligible)} policy-clear · {number(counts.blocked)} requiring review. The new adjustment is evaluated on Preview.</small></span></div><button type="button" className="ops-primary ops-full" disabled={needsCreate || dirty || !ruleAction?.enabled || !ruleTarget} onClick={() => onNavigate({ surface: "repricing-rule", resourceId: ruleTarget?.id, resourceVersion: ruleTarget?.version, view: "rule" })}><span>{needsCreate ? "Save scope to continue" : dirty ? "Save scope version to continue" : "Continue to adjustment"}</span><ArrowRight aria-hidden="true" /></button></Surface></div>
  </>;
}

function effectiveTimestamp(localValue, persistedValue) {
  if (!localValue) return "";
  const offset = persistedValue?.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1] ?? "+01:00";
  return `${localValue.length === 16 ? `${localValue}:00` : localValue}${offset}`;
}

function decimalHundredths(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

function RuleScreen({ data, repricing, onNavigate }) {
  const [persisted, setPersisted] = useState(data);
  const initialType = persisted?.rule?.type === "absolute-change" ? "absolute" : "percentage";
  const initialValue = initialType === "percentage" ? ((persisted?.rule?.changeBasisPoints ?? 0) / 100).toFixed(2) : String(Number(persisted?.rule?.absoluteChange?.amountMinor ?? 0) / 100);
  const initialEffectiveAt = persisted?.effectiveAt ? persisted.effectiveAt.slice(0, 16) : "";
  const [type, setType] = useState(initialType);
  const [value, setValue] = useState(initialValue);
  const [effectiveAt, setEffectiveAt] = useState(initialEffectiveAt);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState(null);
  const [savedVersion, setSavedVersion] = useState(null);
  useEffect(() => {
    setPersisted(data);
    const nextType = data?.rule?.type === "absolute-change" ? "absolute" : "percentage";
    setType(nextType);
    setValue(nextType === "percentage" ? ((data?.rule?.changeBasisPoints ?? 0) / 100).toFixed(2) : String(Number(data?.rule?.absoluteChange?.amountMinor ?? 0) / 100));
    setEffectiveAt(data?.effectiveAt ? data.effectiveAt.slice(0, 16) : "");
    setMutationError(null);
    setSavedVersion(null);
  }, [data?.ref?.id, data?.ref?.version]);
  const numericValue = Number(value);
  const exactHundredths = decimalHundredths(value);
  const preparedRules = list(persisted?.preparedRules);
  const preparedRule = preparedRules.find((candidate) => type === "percentage"
    ? candidate.rule?.type === "percentage-change" && candidate.rule.changeBasisPoints === exactHundredths
    : candidate.rule?.type === "absolute-change" && candidate.rule.absoluteChange?.amountMinor === String(exactHundredths));
  const valid = exactHundredths !== null && (type !== "percentage" || exactHundredths <= 10000) && Boolean(effectiveAt) && Boolean(preparedRule);
  const editAction = list(persisted?.allowedActions).find((action) => action.code === "repricing.rule.edit");
  const saveAction = list(persisted?.allowedActions).find((action) => action.code === "repricing.rule.save");
  const generateAction = list(persisted?.allowedActions).find((action) => action.code === "repricing.preview.generate");
  const previewAction = list(persisted?.allowedActions).find((action) => action.code === "repricing.preview.read");
  const previewTarget = previewAction?.targetRef;
  const dirty = type !== initialType || value !== initialValue || effectiveAt !== initialEffectiveAt;
  const restore = () => { setType(initialType); setValue(initialValue); setEffectiveAt(initialEffectiveAt); setMutationError(null); };
  const selectType = (nextType) => {
    const candidate = preparedRules.find((item) => item.rule?.type === (nextType === "percentage" ? "percentage-change" : "absolute-change"));
    setType(nextType);
    setValue(nextType === "percentage"
      ? ((candidate?.rule?.changeBasisPoints ?? 350) / 100).toFixed(2)
      : String(Number(candidate?.rule?.absoluteChange?.amountMinor ?? 2500) / 100));
    setMutationError(null);
  };
  const renderedValue = type === "percentage" ? `${value || "0"}%` : `NGN ${value || "0"}`;
  const persistRule = async () => {
    setBusy(true);
    setMutationError(null);
    try {
      const rule = type === "percentage"
        ? { type: "percentage-change", changeBasisPoints: exactHundredths, absoluteChange: null, currency: "NGN", rounding: "integer-minor-unit-half-up" }
        : { type: "absolute-change", changeBasisPoints: null, absoluteChange: { amountMinor: String(exactHundredths), currency: "NGN" }, currency: "NGN", rounding: "integer-minor-unit-half-up" };
      const timestamp = effectiveTimestamp(effectiveAt, persisted?.effectiveAt);
      const keyValue = type === "percentage" ? rule.changeBasisPoints : rule.absoluteChange.amountMinor;
      const result = await repricing.saveRule({
        scopeRef: persisted.scopeRef,
        ruleRef: persisted.ref,
        rule,
        effectiveAt: timestamp,
        idempotencyKey: `rpr-rule:${persisted.ref.id}:v${persisted.ref.version}:${type}:${keyValue}:${effectiveAt.replace(/[^0-9]/g, "")}`,
      });
      setPersisted(result.data);
      setSavedVersion(result.data.ref.version);
      setType(result.data.rule.type === "absolute-change" ? "absolute" : "percentage");
      setValue(result.data.rule.type === "percentage-change" ? (result.data.rule.changeBasisPoints / 100).toFixed(2) : String(Number(result.data.rule.absoluteChange.amountMinor) / 100));
      setEffectiveAt(result.data.effectiveAt.slice(0, 16));
    } catch (error) {
      setMutationError(toDomainErrorEnvelope(error, "repricing-rule-save"));
    } finally {
      setBusy(false);
    }
  };
  const openOrGeneratePreview = async () => {
    if (previewTarget) {
      onNavigate({ surface: "repricing", resourceId: previewTarget.id, resourceVersion: previewTarget.version, view: "preview" });
      return;
    }
    setBusy(true);
    setMutationError(null);
    try {
      const result = await repricing.generatePreview({
        ruleRef: persisted.ref,
        idempotencyKey: `rpr-preview:${persisted.ref.id}:v${persisted.ref.version}`,
      });
      onNavigate({ surface: "repricing", resourceId: result.data.ref.id, resourceVersion: result.data.ref.version, view: "preview" });
    } catch (error) {
      setMutationError(toDomainErrorEnvelope(error, "repricing-preview-generate"));
      setBusy(false);
    }
  };
  const primaryDisabled = busy || !valid || (dirty ? !saveAction?.enabled : previewTarget ? !previewAction?.enabled : !generateAction?.enabled);
  const primaryLabel = busy ? dirty ? "Saving Rule…" : "Generating Preview…" : dirty ? "Save Rule" : previewTarget ? "Open persisted Preview" : "Generate versioned Preview";
  return <>
    {!persisted?.revisionOrigin ? <button type="button" className="ops-back" onClick={() => onNavigate({ surface: "repricing-scope", resourceId: "new", view: "scope" })}><ArrowLeft aria-hidden="true" />Scope</button> : null}
    <ScreenHeader eyebrow="REPRICING · ADJUSTMENT" title="Set adjustment" description="Choose the price movement and effective time." />
    <RevisionContext origin={persisted?.revisionOrigin} currentProposalRef={persisted?.relatedProposalRef} onNavigate={onNavigate} />
    <div className="rule-layout"><Surface label="Price adjustment"><header className="ops-section-head"><span>02</span><div><Eyebrow>ADJUSTMENT METHOD</Eyebrow><h2>Move every selected price consistently.</h2></div></header><div className="rule-switch"><button type="button" disabled={!editAction?.enabled || busy} className={type === "percentage" ? "is-selected" : ""} onClick={() => selectType("percentage")}>Percentage</button><button type="button" disabled={!editAction?.enabled || busy} className={type === "absolute" ? "is-selected" : ""} onClick={() => selectType("absolute")}>Absolute NGN</button></div><label className="rule-value"><span>{type === "percentage" ? "Percentage increase" : "Amount increase"}</span><div><input value={value} disabled={!editAction?.enabled || busy} onChange={(event) => setValue(event.target.value)} inputMode="decimal" aria-describedby="adjustment-hint" /><strong>{type === "percentage" ? "%" : "NGN"}</strong></div><small id="adjustment-hint">{valid ? editAction?.enabled ? `${preparedRule.label} has complete sample evidence.` : editAction?.reason?.message : exactHundredths === null && value ? "Use a positive value with no more than two decimal places." : "Prepared outcomes: 3.50%, 4.25%, or NGN 25.00."}</small></label><label className="rule-date"><span>Effective date and time</span><input type="datetime-local" value={effectiveAt} disabled={!editAction?.enabled || busy} onChange={(event) => setEffectiveAt(event.target.value)} /></label>{dirty ? <div className="rule-dirty"><Warning aria-hidden="true" /><span><strong>New preview required.</strong><small>Save this adjustment as a new version.</small></span><button type="button" className="ops-secondary" disabled={busy} onClick={restore}>Restore saved adjustment</button></div> : savedVersion ? <div className="rule-dirty"><CheckCircle aria-hidden="true" /><span><strong>Adjustment version {savedVersion} saved.</strong><small>Generate its exact Preview.</small></span></div> : null}{mutationError ? <div className="rule-dirty" role="alert"><ShieldWarning aria-hidden="true" /><span><strong>Adjustment not saved.</strong><small>{mutationError.error.message}</small></span></div> : null}</Surface><Surface className="rule-explanation" label="Adjustment consequence"><header><Eyebrow>PRICE CONSEQUENCE</Eyebrow><h2>Increase each selected NGN price by {renderedValue}.</h2><p>{dirty ? "Save before generating a new Preview." : persisted?.explanation}</p></header><div className="rule-proof"><FunctionIconFallback /><span><small>Calculation</small><strong>Deterministic minor-unit arithmetic</strong><em>The Preview records the formula and rounding.</em></span></div><div className="rule-proof"><ShieldCheck aria-hidden="true" /><span><small>Margin policy evaluation</small><strong>Most specific policy wins</strong><em>SKU, channel, category, then organisation. Every result keeps its applied policy evidence.</em></span></div><button type="button" className="ops-primary ops-full" disabled={primaryDisabled} onClick={dirty ? persistRule : openOrGeneratePreview}><span>{primaryLabel.replaceAll("Rule", "adjustment")}</span><ArrowRight aria-hidden="true" /></button></Surface></div>
  </>;
}

function FunctionIconFallback() { return <SlidersHorizontal aria-hidden="true" />; }

function ProposalListScreen({ data, session, onNavigate }) {
  const capabilities = list(session?.effectiveCapabilities);
  const canPrepare = capabilities.includes("repricing:prepare");
  const canAct = canPrepare || ["proposal:submit", "proposal:draft:edit", "proposal:handoff", "proposal:approve", "override:request", "override:decide", "publish:execute", "publish:reconcile"].some((code) => capabilities.includes(code));
  const [view, setView] = useState(canAct ? "needs-me" : "all");
  const [query, setQuery] = useState("");
  const items = list(data?.items);
  const views = [["all", "All proposals"], ["needs-me", "Needs me"], ["blocked", "Blocked"], ["awaiting-approval", "Awaiting approval"], ["approved", "Approved to publish"], ["published", "Published"]];
  const stateMatches = (item, targetView = view) => targetView === "all" || (targetView === "needs-me" ? item.needsCurrentActor === true : targetView === "awaiting-approval" ? item.state === "submitted" : item.state === targetView);
  const normalizedQuery = query.trim().toLowerCase();
  const shown = items.filter((item) => stateMatches(item)).filter((item) => !normalizedQuery || `${item.title} ${item.state} ${item.readiness}`.toLowerCase().includes(normalizedQuery));
  useEffect(() => { setView(canAct ? "needs-me" : "all"); setQuery(""); }, [session?.actor?.id, session?.capabilityVersion, canAct]);
  return <>
    <ScreenHeader eyebrow="PROPOSALS" title="Proposals" description={canAct ? "Track pricing decisions and their next steps." : "Read-only access to pricing decisions."}>
      {canPrepare ? <button type="button" className="ops-primary" onClick={() => onNavigate({ surface: "repricing-scope", resourceId: "new", view: "scope" })}><span>New repricing</span><ArrowRight aria-hidden="true" /></button> : null}
    </ScreenHeader>
    <Surface label="Proposal queue">
      <header className="ops-toolbar"><WorkspaceViewTabs
        idPrefix="proposal-queue-tab"
        label="Proposal queue views"
        panelId="proposal-queue-results"
        value={view}
        onChange={setView}
        views={views.map(([id, label]) => ({ id, label, count: items.filter((item) => stateMatches(item, id)).length }))}
      /><label className="ops-search"><MagnifyingGlass aria-hidden="true" /><input aria-label="Search proposals" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search proposals" /></label></header>
      <div id="proposal-queue-results" role="tabpanel" aria-labelledby={`proposal-queue-tab-${view}`}>
        <div className="proposal-list"><div className="proposal-list__head"><span>Proposal</span><span>State and blocker</span><span>Scope</span><span>Authority</span><span>Release</span><span>Updated</span><span /></div>{shown.map((item) => <button type="button" key={item.ref.id} onClick={() => onNavigate({ surface: "proposal", resourceId: item.ref.id, resourceVersion: item.ref.version, view: "overview" })}><span><strong>{item.title}</strong><small>Proposal · v{item.ref.version}</small></span><span><StatusPill tone={item.state === "blocked" ? "danger" : item.state === "approved" || item.state === "published" ? "success" : "attention"}>{humanise(item.state)}</StatusPill>{item.readiness !== item.state ? <small>{humanise(item.readiness)}</small> : null}</span><span><strong>{item.counts.lines == null ? "Scope unavailable" : `${number(item.counts.lines)} lines`}</strong><small>{item.counts.blocked == null ? "Requires current version" : `${number(item.counts.blocked)} requiring authority`}</small></span><span><small>Owner</small><strong>{(item.submissionOwner ?? item.owner)?.displayName ? shortActorName((item.submissionOwner ?? item.owner).displayName) : "Unassigned"}</strong><em>Approver {shortActorName(item.assignedApprover?.displayName)}</em></span><span><small>Publisher</small><strong>{shortActorName(item.assignedPublisher?.displayName)}</strong></span><span>{dateTime(item.updatedAt)}</span><CaretRight aria-hidden="true" /></button>)}</div>
        {!shown.length ? <EmptyBoundary title={view === "needs-me" && !normalizedQuery ? "No Proposals need your action." : "No Proposals match this view."} detail="Read access does not assign the next action." actionLabel={normalizedQuery ? "Clear search" : "Show all"} onAction={() => normalizedQuery ? setQuery("") : setView("all")} /> : null}
      </div>
      <footer className="queue-result-summary" aria-label="Proposal queue summary"><span>{number(shown.length)} {shown.length === 1 ? "proposal" : "proposals"}</span></footer>
    </Surface>
  </>;
}

function RulesScreen({ data, detail, onNavigate }) {
  if (detail) {
    return <><button type="button" className="ops-back" onClick={() => onNavigate({ surface: "rules", view: "read" })}><ArrowLeft aria-hidden="true" />Margin policies</button><ScreenHeader eyebrow="MARGIN POLICY" title={data?.name ?? "Margin floor"} description={data?.explanation ?? "Read-only policy evidence."} meta={<><StatusPill tone="success">{displayRuleVersion(data?.ref?.version)}</StatusPill><span>{ruleScopeLabel(data?.scope)}</span></>} /><div className="record-layout"><Surface label="Margin policy definition"><div className="rule-detail-value"><small>Minimum gross margin</small><strong>{ruleValue(data)}</strong><span>Evaluated after the adjustment</span></div><div className="ops-detail-grid"><div><dt>Code</dt><dd>{data?.code}</dd></div><div><dt>Precedence</dt><dd>{ruleScopeLabel(data?.scope)}</dd></div><div><dt>Status</dt><dd>{humanise(data?.status)}</dd></div><div><dt>Access</dt><dd>Read only</dd></div></div></Surface><Surface label="Margin policy evidence"><header className="ops-section-head"><span>02</span><div><Eyebrow>VERSIONED EVIDENCE</Eyebrow><h2>Why this policy can apply.</h2></div></header><div className="rule-usage"><div><ShieldCheck aria-hidden="true" /><span><strong>{data?.code ?? "Policy code unavailable"} · {displayRuleVersion(data?.ref?.version)}</strong><small>{ruleScopeLabel(data?.scope)} precedence</small></span></div><div><GitBranch aria-hidden="true" /><span><strong>Bound at evaluation</strong><small>The Preview keeps the exact winning policy and version.</small></span></div></div></Surface></div></>;
  }
  const items = list(data?.items);
  return <><ScreenHeader eyebrow="POLICY" title="Margin policies" description="Versioned floors and precedence." /><Surface label="Margin policies"><div className="rules-list"><div className="rules-list__head"><span>Policy</span><span>Precedence</span><span>Floor</span><span>Version</span><span>Status</span><span /></div>{items.map((item) => <button type="button" key={item.id} onClick={() => onNavigate({ surface: "rule-detail", resourceId: item.id, view: "read" })}><span><strong>{item.name}</strong><small>{item.code}</small></span><span>{ruleScopeLabel(item.scope)}</span><strong className="rule-floor" style={{ "--rule-floor-progress": ruleFloorProgress(item) }}>{ruleValue(item)}</strong><span title={`Exact version ${item.ref?.version ?? "unavailable"}`}>{displayRuleVersion(item.ref?.version)}</span><span>{humanise(item.status)}</span><CaretRight aria-hidden="true" /></button>)}</div></Surface></>;
}

function AuditScreen({ data, detail, onNavigate }) {
  const events = list(data?.events ?? data?.items).map(auditView);
  if (detail) {
    return <><button type="button" className="ops-back" onClick={() => onNavigate({ surface: "audit", view: "history" })}><ArrowLeft aria-hidden="true" />Audit trail</button><ScreenHeader eyebrow="ENTITY HISTORY" title={`${humanise(data?.filterResult?.entityType ?? "record")} history`} description="Read-only evidence from source to outcome." meta={<><StatusPill tone="success">{events.length} events</StatusPill><span>{data?.page?.coverage === "complete-page" ? "History complete" : "Partial history"}</span></>} /><Surface label="Entity history"><AuditTimeline events={events} /></Surface></>;
  }
  return <AuditLedger events={events} onNavigate={onNavigate} />;
}

function AuditLedger({ events, onNavigate }) {
  const [query, setQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const shown = events.filter((event) => entityFilter === "all" || event.entityType === entityFilter)
    .filter((event) => sourceFilter === "all" || event.source === sourceFilter)
    .filter((event) => !query || `${event.label} ${event.detail ?? ""} ${event.entityLabel} ${event.actor?.displayName ?? event.actor}`.toLowerCase().includes(query.toLowerCase()));
  const nextEntityFilter = () => setEntityFilter((current) => current === "all" ? "proposal" : current === "proposal" ? "override" : "all");
  const nextSourceFilter = () => setSourceFilter((current) => current === "all" ? "system" : "all");
  return <><ScreenHeader eyebrow="AUDIT" title="Audit trail" description="Changes, actors and outcomes." /><Surface label="Audit ledger"><header className="ops-toolbar"><div className="audit-filters"><button type="button" aria-pressed={entityFilter !== "all"} onClick={nextEntityFilter}><FunnelSimple aria-hidden="true" />{entityFilter === "all" ? "All events" : `${humanise(entityFilter)} events`}</button><button type="button" aria-pressed={sourceFilter !== "all"} onClick={nextSourceFilter}>{sourceFilter === "all" ? "All actors" : "System events"}</button><span className="audit-window">Last 30 days</span></div><label className="ops-search"><MagnifyingGlass aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search object or event" /></label></header><div className="audit-ledger">{shown.map((event) => {
    const target = { surface: "audit-detail", entityType: event.entityType ?? "proposal", resourceId: event.entityId, resourceVersion: event.version, view: "history" };
    return <article key={event.id}>
      <span className={`audit-event-icon is-${event.eventClass}`}><AuditEventIcon eventClass={event.eventClass} /></span>
      <span><strong>{event.label}</strong><small>{event.detail}</small></span>
      <span><small>Actor</small><strong>{event.actor?.displayName ?? event.actor}</strong></span>
      <span><small>Object</small><a className="audit-object-link" href={workspaceHash(target)} aria-label={`Open ${event.entityLabel} history`} onClick={(clickEvent) => { clickEvent.preventDefault(); onNavigate(target); }}><strong>{event.entityLabel}</strong><CaretRight aria-hidden="true" /></a></span>
      <time dateTime={event.occurredAt}><span>{event.occurredAtLabel}</span><small>{event.occurredAtRelativeLabel}</small></time>
    </article>;
  })}</div>{!shown.length ? <EmptyBoundary title="No audit events match this view." detail="Clear the search and filters to restore the evidence ledger." actionLabel="Clear filters" onAction={() => { setQuery(""); setEntityFilter("all"); setSourceFilter("all"); }} /> : null}</Surface></>;
}

function AuditTimeline({ events }) {
  return <ol className="audit-timeline">{events.map((event, index) => <li key={event.id}><span className={index === events.length - 1 ? "is-final" : ""}>{event.source === "system" ? <Database aria-hidden="true" /> : <Check aria-hidden="true" />}</span><div><small>{event.occurredAtLabel}</small><strong>{event.label}</strong><p>{event.detail}</p><footer><em>{event.actor?.displayName ?? event.actor}</em><em>{event.role}</em><em>{event.entityLabel}</em></footer></div></li>)}</ol>;
}

/**
 * Renders every non-Preview, non-governed route through the repository seam.
 * Components never import fixture objects directly.
 */
export function OperationalWorkspace({ route, repositories, session, onNavigate }) {
  const resource = useOperationalResource(route, repositories, session);
  if (route.surface === "import-new") return <ImportCreate repositories={repositories} onNavigate={onNavigate} />;
  if (resource.status === "loading") return <LoadingBoundary title={`Loading ${route.surface.replaceAll("-", " ")}`} />;
  if (resource.status === "error") {
    const resumeStage = resource.error?.error?.code === "IMPORT_STAGE_NOT_AVAILABLE" ? resource.error.error.details?.resumeStage : null;
    return <ErrorBoundary error={resource.error} onRetry={resumeStage ? null : resource.reload} actionLabel={resumeStage ? `Return to ${humanise(resumeStage)}` : null} onAction={resumeStage ? () => onNavigate({ surface: `import-${resumeStage}`, resourceId: route.resourceId, resourceVersion: resource.error.error.details?.resourceVersion ?? route.resourceVersion, view: resumeStage }, { replace: true }) : null} />;
  }
  const data = resource.data;

  if (route.surface === "work") return <QueueScreen data={data} route={route} onNavigate={onNavigate} session={session} />;
  if (route.surface === "catalog") return <CatalogScreen data={data} catalog={repositories.catalog} session={session} onNavigate={onNavigate} />;
  if (route.surface === "catalog-detail") return <CatalogDetailScreen data={data} onNavigate={onNavigate} />;
  if (route.surface === "imports") return <ImportsLedger data={data} onNavigate={onNavigate} />;
  if (route.surface.startsWith("import-")) return <ImportJourney data={data} route={route} repositories={repositories} onNavigate={onNavigate} />;
  if (route.surface === "repricing-scope") return <ScopeScreen data={data} repricing={repositories.repricing} onNavigate={onNavigate} />;
  if (route.surface === "repricing-rule") return <RuleScreen data={data} repricing={repositories.repricing} onNavigate={onNavigate} />;
  if (route.surface === "proposals") return <ProposalListScreen data={data} session={session} onNavigate={onNavigate} />;
  if (route.surface === "rules") return <RulesScreen data={data} onNavigate={onNavigate} />;
  if (route.surface === "rule-detail") return <RulesScreen data={data} detail onNavigate={onNavigate} />;
  if (route.surface === "audit") return <AuditScreen data={data} onNavigate={onNavigate} />;
  if (route.surface === "audit-detail") return <AuditScreen data={data} detail onNavigate={onNavigate} />;
  return <EmptyBoundary title="This route is not available." detail="Return to the Work Queue to continue the governed journey." actionLabel="Open Work Queue" onAction={() => onNavigate({ surface: "work", view: "needs-me" })} />;
}
