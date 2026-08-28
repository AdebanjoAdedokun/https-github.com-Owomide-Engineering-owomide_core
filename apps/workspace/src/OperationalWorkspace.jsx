import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Barcode,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  ClockCounterClockwise,
  Database,
  FileCsv,
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
  Storefront,
  Tag,
  UploadSimple,
  Warning,
  X,
} from "@phosphor-icons/react";
import { toDomainErrorEnvelope } from "./data/domainError.js";
import { formatEffectiveAt, formatRecordedAt, formatRelativeTime, shortActorName, shortOrganisationName } from "./workspacePresenter.js";
import { workspaceHash } from "./workspaceRouting.js";
import { CursorPager, INSPECTOR_DOCK_MIN_SURFACE } from "./workspaceTablePatterns.jsx";

const number = (value) => Number(value ?? 0).toLocaleString("en-NG");
const list = (value) => Array.isArray(value) ? value : [];
const money = (value) => {
  if (!value || value.amountMinor == null) return "Unavailable";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: value.currency ?? "NGN", minimumFractionDigits: 2 }).format(Number(value.amountMinor) / 100);
};
const dateTime = formatRecordedAt;
let pendingQueueTabFocus = null;

function catalogView(item) {
  const summary = item?.summary ?? item ?? {};
  return {
    ...summary,
    id: summary.canonicalSkuId ?? summary.id ?? summary.ref?.id,
    productName: summary.product?.name ?? summary.productName,
    variant: summary.product?.variant ?? summary.variant,
    scopeLabel: [summary.channel?.name, summary.location?.name].filter(Boolean).join(" · "),
    priceLabel: money(summary.currentPrice),
    costLabel: money(summary.currentCost),
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

function RuleScopeIcon({ scope }) {
  const Icon = scope === "sku" ? Barcode : scope === "channel" ? Storefront : scope === "category" ? Tag : scope === "global" ? Database : ShieldCheck;
  return <Icon aria-hidden="true" data-rule-scope={scope ?? "unknown"} />;
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

function QueueScreen({ data, route, onNavigate }) {
  const [view, setView] = useState(route.view ?? "needs-me");
  const [query, setQuery] = useState("");
  const [tabOverflow, setTabOverflow] = useState({ before: false, after: false });
  const tabsRef = useRef(null);
  const items = list(data?.items);
  const inView = (item) => view === "needs-me" || (view === "blocked" && item.status === "blocked") || (view === "awaiting-approval" && item.status === "submitted") || (view === "ready-to-publish" && item.status === "approved") || (view === "incomplete-rollout" && item.status === "incomplete");
  const shown = items.filter(inView).filter((item) => !query || `${item.title} ${item.reason} ${item.status}`.toLowerCase().includes(query.toLowerCase()));
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const attentionCount = shown.reduce((total, item) => total + Number(item.counts?.attention ?? 0), 0);
  const views = [
    ["needs-me", "Needs me"], ["blocked", "Blocked"], ["awaiting-approval", "Awaiting approval"], ["ready-to-publish", "Ready to publish"], ["incomplete-rollout", "Incomplete rollout"],
  ];
  const move = (next) => { setView(next); onNavigate({ surface: "work", view: next }, { replace: true }); };
  const moveFromKey = (event, index) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + views.length) % views.length;
    pendingQueueTabFocus = views[nextIndex][0];
    move(views[nextIndex][0]);
  };
  useEffect(() => {
    const rail = tabsRef.current;
    const active = rail?.querySelector('[aria-selected="true"]');
    if (!rail || !active) return;
    const updateOverflow = () => {
      const before = rail.scrollLeft > 2;
      const after = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2;
      setTabOverflow((current) => current.before === before && current.after === after ? current : { before, after });
    };
    if (pendingQueueTabFocus === view) {
      active.focus();
      pendingQueueTabFocus = null;
    }
    rail.addEventListener("scroll", updateOverflow, { passive: true });
    window.addEventListener("resize", updateOverflow);
    updateOverflow();
    let frame = null;
    if (rail.scrollWidth > rail.clientWidth) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      active.scrollIntoView({ block: "nearest", inline: "center", behavior: reduced ? "auto" : "smooth" });
      frame = window.requestAnimationFrame(updateOverflow);
    }
    return () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      rail.removeEventListener("scroll", updateOverflow);
      window.removeEventListener("resize", updateOverflow);
    };
  }, [view]);
  return <>
    <ScreenHeader eyebrow="WORK" title="Work queue" description="Actions waiting on you.">
      <button className="ops-secondary" type="button" onClick={() => onNavigate({ surface: "import-new", view: "create" })}><UploadSimple aria-hidden="true" />Import data</button>
      <button className="ops-primary" type="button" onClick={() => onNavigate({ surface: "repricing-scope", resourceId: "new", view: "scope" })}><span>New repricing</span><ArrowRight aria-hidden="true" /></button>
    </ScreenHeader>
    <Surface label="Work queue">
      <header className="ops-toolbar"><div ref={tabsRef} className={`ops-tabs${tabOverflow.before ? " has-overflow-before" : ""}${tabOverflow.after ? " has-overflow-after" : ""}`} role="tablist" aria-label="Work queue views">{views.map(([id, label], index) => <button id={`work-queue-tab-${id}`} key={id} className={view === id ? "is-active" : ""} type="button" role="tab" aria-controls="work-queue-results" aria-selected={view === id} tabIndex={view === id ? 0 : -1} onKeyDown={(event) => moveFromKey(event, index)} onClick={() => move(id)}>{label}<span>{id === "needs-me" ? items.length : items.filter((item) => id === "blocked" ? item.status === "blocked" : id === "awaiting-approval" ? item.status === "submitted" : id === "ready-to-publish" ? item.status === "approved" : item.status === "incomplete").length}</span></button>)}</div><label className="ops-search"><MagnifyingGlass aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search work" /></label></header>
      <div id="work-queue-results" role="tabpanel" aria-labelledby={`work-queue-tab-${view}`}>{shown.length ? <div className="queue-list">{shown.map((item) => {
        const target = item.type === "import" ? { surface: "import-map", resourceId: item.ref.id, resourceVersion: item.ref.version, view: "map" } : item.type === "proposal" ? { surface: "proposal", resourceId: item.ref.id, resourceVersion: item.ref.version, view: "overview" } : { surface: "repricing", resourceId: "FX-004", view: "preview" };
        return <button type="button" className="queue-row" key={item.id} onClick={() => onNavigate(target)}><span className="queue-row__kind">{item.type}</span><span className="queue-row__main"><strong>{item.title}</strong><small>{item.reason}</small></span><StatusPill tone={item.status === "blocked" ? "danger" : "attention"}>{item.status.replaceAll("-", " ")}</StatusPill><span className="queue-row__actor"><small>Next actor</small><strong>{item.nextActor}</strong></span><span className="queue-row__source"><small>Scope</small><strong>{number(item.counts?.attention)} of {number(item.counts?.total)} need attention</strong></span><span className="queue-row__updated">{formatRecordedAt(item.updatedAt)}</span><CaretRight aria-hidden="true" /></button>;
      })}</div> : <EmptyBoundary title={query ? "No work matches this search." : "No work requires this authority."} detail={query ? "Clear the search to restore this agenda." : "New assigned or shared work will appear here."} actionLabel={query ? "Clear search" : undefined} onAction={() => setQuery("")} />}</div>
      <footer className="ops-summary-strip" aria-label="Work queue summary"><span><small>Current view</small><strong>{number(shown.length)} shown</strong></span><span><small>Blocked work</small><strong>{number(blockedCount)}</strong></span><span><small>Line attention</small><strong>{number(attentionCount)}</strong></span></footer>
    </Surface>
  </>;
}

function CatalogScreen({ data, catalog, onNavigate }) {
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
      <button className="ops-secondary" type="button" onClick={() => onNavigate({ surface: "imports", view: "ledger" })}>View imports</button>
      <button className="ops-primary" type="button" onClick={() => onNavigate({ surface: "repricing-scope", resourceId: "new", view: "scope" })}><span>Start repricing</span><ArrowRight aria-hidden="true" /></button>
    </ScreenHeader>
    <Surface surfaceRef={catalogSurfaceRef} className={`ops-split-surface catalog-split-surface${selected ? " has-peek" : ""}${modeClass}`} label="Catalog">
      <div className="ops-list-plane" aria-busy={paging} aria-hidden={inspectorOwnsSurface ? "true" : undefined} inert={inspectorOwnsSurface ? true : undefined}>
        <header className="ops-toolbar"><div><strong>{number(authoritativeCount)} SKUs</strong><span>{number(items.length)} on this page</span></div><label className="ops-search"><MagnifyingGlass aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product or SKU code" /></label></header>
        <div className="catalog-header" aria-hidden="true"><span>Product and SKU code</span><span>Scope</span><span>Current price</span><span>Source</span><span>Status</span></div>
        <div className="catalog-list">{items.map((item) => <button type="button" key={item.id} className={selected?.id === item.id ? "is-selected" : ""} aria-expanded={selected?.id === item.id} aria-controls={selected?.id === item.id ? "catalog-detail-peek" : undefined} onClick={(event) => openSelected(event, item)}><span className="catalog-identity"><i>{item.productName?.slice(0, 1)}</i><span><strong>{item.productName}</strong><small>{[item.variant, item.merchantSku ? `SKU ${item.merchantSku}` : null].filter(Boolean).join(" · ")}</small></span></span><span><Storefront aria-hidden="true" />{item.scopeLabel ?? item.scope}</span><span className="catalog-money"><strong>{item.priceLabel ?? item.price}</strong><small>Cost {item.costLabel ?? item.cost}</small></span><span><Database aria-hidden="true" />{item.sourceSummaryLabel ?? item.sourceLabel ?? item.source}</span>{item.statusTone === "success" ? <span className="catalog-status-current"><CheckCircle aria-hidden="true" />{item.statusLabel}</span> : <StatusPill tone={item.statusTone}>{item.statusLabel}</StatusPill>}<CaretRight aria-hidden="true" /></button>)}</div>
        {!items.length ? <EmptyBoundary title="No catalog records match." detail="Change the search without changing the authoritative catalog." actionLabel="Clear search" onAction={() => setQuery("")} /> : null}
        {pageError ? <div className="cursor-pager-error" role="alert"><span>{pageError.error.message}</span><button type="button" onClick={() => pageRetryRef.current && loadPage(pageRetryRef.current)}>Retry page</button></div> : null}
        <CursorPager pageIndex={pageIndex} pageSize={pageData?.page?.limit ?? CATALOG_PAGE_LIMIT} returnedCount={items.length} matchedCount={sampleCount} authoritativeCount={authoritativeCount} itemLabel="SKUs" scopeLabel="authoritative SKUs" hasNext={Boolean(pageData?.page?.nextCursor)} busy={paging || queryPending} onPrevious={previousPage} onNext={nextPage} />
      </div>
      {selected && inspectorOwnsSurface ? <button type="button" className="ops-peek-scrim" tabIndex="-1" aria-hidden="true" onClick={closeSelected} /> : null}
      {selected ? <aside ref={selectedPeekRef} id="catalog-detail-peek" className="ops-peek" tabIndex="-1" aria-label={`Catalog detail for ${selected.productName}`} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeSelected(); } }}><header><div><div className="catalog-peek__context"><Eyebrow>CATALOG RECORD</Eyebrow><StatusPill tone={selected.statusTone}>{selected.statusLabel}</StatusPill></div><h2>{selected.productName}</h2><p>{selected.variant}</p></div><button type="button" className="ops-icon" onClick={closeSelected} aria-label="Close catalog detail"><X aria-hidden="true" /></button></header><div className="catalog-code"><small>Merchant SKU</small><strong>{selected.merchantSku}</strong><span>Organisation-scoped business identifier</span></div><dl className="ops-detail-grid"><div><dt>Channel and location</dt><dd>{selected.scopeLabel ?? selected.scope}</dd></div><div><dt>Current price</dt><dd>{selected.priceLabel ?? selected.price}</dd></div><div><dt>Current cost</dt><dd>{selected.costLabel ?? selected.cost}</dd></div><div><dt>Effective</dt><dd>{selected.effectiveAtLabel ?? selected.effectiveAt}</dd></div></dl><section className="identifier-list"><h3>Identifiers</h3>{list(selected.identifiers).map((identifier) => <div key={`${identifier.namespace}:${identifier.value}`}><span>{identifier.namespace}</span><strong>{identifier.value}</strong><em>{identifier.primary ? "Primary" : "Alias"}</em></div>)}</section><section className="peek-provenance"><Database aria-hidden="true" /><span><small>Source record</small><strong>{selected.sourceLabel ?? selected.source}</strong><em>{selected.provenanceLabel ?? "Recorded from the trusted import boundary"}</em></span></section><button type="button" className="ops-secondary ops-full" onClick={() => onNavigate({ surface: "catalog-detail", resourceId: selected.id, view: "detail" })}>Open full record</button></aside> : null}
    </Surface>
  </>;
}

function CatalogDetailScreen({ data, onNavigate }) {
  const item = catalogView(data);
  return <><button type="button" className="ops-back" onClick={() => onNavigate({ surface: "catalog", view: "list" })}><ArrowLeft aria-hidden="true" />Catalog</button><ScreenHeader eyebrow="CATALOG RECORD" title={item.productName ?? "Catalog record"} description={`${item.variant ?? "Variant"} · SKU code ${item.merchantSku ?? "Resolving"}`} meta={<><StatusPill tone={item.statusTone}>{item.statusLabel ?? "Current"}</StatusPill><span>{item.scopeLabel ?? item.scope}</span></>} /><div className="record-layout"><Surface label="Price and cost record"><div className="record-money"><div><small>Current price</small><strong>{item.priceLabel ?? item.price}</strong><span>{item.currency ?? "NGN"}</span></div><div><small>Current cost</small><strong>{item.costLabel ?? item.cost}</strong><span>Current recorded cost</span></div><div className="record-money__effective"><small>Effective</small><strong>{item.effectiveAtLabel ?? item.effectiveAt}</strong><span>Recorded {item.recordedAtLabel ?? "Unavailable"}</span></div></div><div className="record-note"><Info aria-hidden="true" /><span>This record is read-only. Start repricing to propose a change.</span></div></Surface><Surface label="Record evidence"><header className="ops-section-head"><span>01</span><div><Eyebrow>IDENTITY AND SOURCE</Eyebrow><h2>Identifiers and source.</h2></div></header><div className="evidence-ledger">{list(item.identifiers).map((identifier) => <div key={`${identifier.namespace}:${identifier.value}`}><Barcode aria-hidden="true" /><span><small>{identifier.namespace}</small><strong>{identifier.value}</strong></span><em>{identifier.primary ? "Primary" : "Alias"}</em></div>)}<div><Database aria-hidden="true" /><span><small>Source</small><strong>{item.sourceLabel ?? item.source}</strong></span><em>Trusted</em></div></div></Surface></div></>;
}

function ImportsLedger({ data, onNavigate }) {
  const [query, setQuery] = useState("");
  const items = list(data?.items);
  const shown = items.filter((item) => !query || `${item.sourceFile?.name ?? ""} ${item.title ?? ""} ${item.stage ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <ScreenHeader eyebrow="IMPORTS" title="Imports" description="Validate and reconcile every row.">
      <button className="ops-primary" type="button" onClick={() => onNavigate({ surface: "import-new", view: "create" })}><UploadSimple aria-hidden="true" /><span>Create sample import</span></button>
    </ScreenHeader>
    <Surface label="Import ledger"><header className="ops-toolbar"><div><strong>{items.length} import batches</strong><span>Source, progress and row reconciliation</span></div><label className="ops-search"><MagnifyingGlass aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search imports" /></label></header><div className="import-ledger"><div className="import-ledger__head"><span>Source</span><span>Progress</span><span>Row accounting</span><span>Owner</span><span>Updated</span><span /></div>{shown.map((item) => <button type="button" key={item.ref.id} onClick={() => onNavigate({ surface: `import-${item.stage}`, resourceId: item.ref.id, resourceVersion: item.ref.version, view: item.stage })}><span className="import-file"><FileCsv aria-hidden="true" /><span><strong>{item.sourceFile?.name ?? "Source file unavailable"}</strong><small>{item.title} · {item.sourceFile?.format ?? "Format unavailable"}</small></span></span><StatusPill tone={item.state === "committed" ? "success" : item.state === "partial-success" || item.state === "needs-attention" ? "attention" : "neutral"}>{item.stage.replaceAll("-", " ")}</StatusPill><span className="import-counts"><strong>{number(item.counts?.input)} input</strong><small>{number(item.counts?.valid ?? item.counts?.committed)} clear · {number(item.counts?.invalid ?? item.counts?.rejected)} require action</small></span><span className="import-ledger__owner"><small>Owner</small><strong>{shortActorName(item.owner?.displayName ?? "Teni · Sample Operator")}</strong></span><span className="import-ledger__updated"><small>Updated</small><strong>{dateTime(item.updatedAt)}</strong></span><CaretRight aria-hidden="true" /></button>)}</div>{!shown.length ? <EmptyBoundary title="No imports match this search." detail="Clear the search to restore the import ledger." actionLabel="Clear search" onAction={() => setQuery("")} /> : null}</Surface>
  </>;
}

function ImportActionError({ error }) {
  if (!error) return null;
  return <div className="upload-boundary" role="alert"><ShieldWarning aria-hidden="true" /><span><strong>{error.error.code}</strong><small>{error.error.message}</small></span></div>;
}

function ImportCreate({ repositories, onNavigate }) {
  const [intent, setIntent] = useState("cost-update");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey] = useState(() => importRequestKey("create"));
  const intents = [["catalog-bootstrap", "Catalog bootstrap", "Create trusted SKU and product records."], ["cost-update", "Cost update", "Match existing SKU codes and update costs."], ["price-update", "Price-list update", "Bring an external list into governed review."], ["mixed-update", "Mixed catalog update", "Profile identity, product, cost and price fields together."]];
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
    <ScreenHeader eyebrow="SAMPLE IMPORT" title="Start an import" description="Name the batch before selecting a source." />
    <div className="import-create-layout"><Surface label="Import intent"><header className="ops-section-head"><span>01</span><div><Eyebrow>IMPORT INTENT</Eyebrow><h2>What should this source represent?</h2></div></header><div className="intent-grid">{intents.map(([id, title, detail]) => <button type="button" key={id} className={intent === id ? "is-selected" : ""} onClick={() => setIntent(id)} aria-pressed={intent === id}><span>{intent === id ? <Check aria-hidden="true" /> : null}</span><strong>{title}</strong><small>{detail}</small></button>)}</div></Surface><Surface label="Sample data boundary"><header className="ops-section-head"><span>02</span><div><Eyebrow>CREATE BATCH</Eyebrow><h2>Open a versioned Sample data journey.</h2></div></header><div className="upload-boundary"><Info aria-hidden="true" /><span><strong>Fixture-memory only</strong><small>Create, upload, mapping, validation, acknowledgement, commit and reconciliation are recorded behind the repository seam. No local file or live Catalog is changed.</small></span></div><div className="profile-facts"><div><small>Truth label</small><strong>Sample data</strong></div><div><small>Mutation authority</small><strong>False</strong></div><div><small>Next stage</small><strong>Upload</strong></div><div><small>Version binding</small><strong>Required</strong></div></div><ImportActionError error={error} /><button type="button" className="ops-primary ops-full" disabled={busy} onClick={create}><span>{busy ? "Creating sample batch…" : "Create sample import"}</span><ArrowRight aria-hidden="true" /></button></Surface></div>
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
  return <div className="import-create-layout import-upload-layout"><Surface label="Source file"><header className="ops-section-head"><span>01</span><div><Eyebrow>SOURCE FILE</Eyebrow><h2>Select the synthetic file to profile.</h2></div></header><button type="button" className={`upload-well${selected ? " is-selected" : ""}`} disabled={!uploadAction?.enabled} onClick={() => setSelected((current) => !current)}><span>{selected ? <FileXls aria-hidden="true" /> : <UploadSimple aria-hidden="true" />}</span><strong>{selected ? "owomide-fixture-supplier-costs-messy.csv" : "Choose the CSV sample"}</strong><small>{selected ? "80 data rows · retained as Sample data provenance" : "Synthetic CSV · live service limits are not inferred"}</small><em>{uploadAction?.enabled ? selected ? "Replace sample" : "Select sample file" : "Source already recorded"}</em></button></Surface><Surface label="Upload boundary"><header className="ops-section-head"><span>02</span><div><Eyebrow>UPLOAD BOUNDARY</Eyebrow><h2>The source remains visibly synthetic.</h2></div></header><div className="upload-boundary"><Info aria-hidden="true" /><span><strong>Sample data only</strong><small>This action records the synthetic source against batch version {data?.ref?.version}. It does not upload a local file or write the Catalog.</small></span></div><div className="profile-facts"><div><small>Accepted sample</small><strong>CSV</strong></div><div><small>Rows</small><strong>80</strong></div><div><small>Authority</small><strong>Fixture memory</strong></div><div><small>Next stage</small><strong>Profile</strong></div></div><ImportActionError error={error} /><button type="button" className="ops-primary ops-full import-upload-layout__action" disabled={!selected || !uploadAction?.enabled || busy} onClick={upload}><span>{busy ? "Recording sample source…" : "Record sample source"}</span><ArrowRight aria-hidden="true" /></button></Surface></div>;
}

function MappingTable({ mappings, reviewed = false, reviewContext = null }) {
  const rows = reviewed && reviewContext?.effectiveAt
    ? [...list(mappings), { source: reviewContext.source ?? "Import context", examples: [formatEffectiveAt(reviewContext.effectiveAt)], target: "effectiveAt", targetLabel: "Effective time", required: true, confidenceBasisPoints: 10000, transform: "Organisation timezone · Africa/Lagos" }]
    : list(mappings);
  return <div className="mapping-table"><div className="mapping-head"><span>Source field and examples</span><span>Canonical target</span><span>Confidence</span><span>Transform</span></div>{rows.map((mapping) => {
    const confidence = reviewed ? Math.max(90, Math.round((mapping.confidenceBasisPoints ?? 0) / 100)) : Math.round((mapping.confidenceBasisPoints ?? 0) / 100);
    const target = mapping.targetLabel ?? mapping.target ?? (reviewed ? humanise(mapping.candidates?.[0] ?? "Reviewed mapping") : "Choose field");
    return <div className={mapping.required && !mapping.target && !reviewed ? "is-blocked" : ""} key={mapping.source}><span className="mapping-field" data-label="Source field"><strong>{mapping.source}</strong><small>{list(mapping.examples).join(" · ")}</small></span><span className="mapping-target" data-label="Canonical target"><small>{mapping.required ? "Required" : "Optional"}</small><strong>{target}</strong>{mapping.target === "merchantSku" ? <em>Organisation-scoped SKU code</em> : null}</span><span className="mapping-confidence" data-label="Confidence"><StatusPill tone={confidence >= 90 ? "success" : confidence < 60 ? "danger" : "attention"}>{confidence}% match</StatusPill></span><span className="mapping-transform" data-label="Transform"><strong>{reviewed && !mapping.transform ? "Reviewed source mapping" : mapping.transform ?? "No transform"}</strong><small>Supplier cost template v3</small></span></div>;
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
    {stage === "profile" ? <Surface label="Profiled source"><div className="profile-layout"><section><header className="ops-section-head"><span>02</span><div><Eyebrow>{profiled ? "PROFILE COMPLETE" : "PROFILE SOURCE"}</Eyebrow><h2>{profiled ? "The shape of the Sample data source is known." : "Inspect the Sample data source shape."}</h2></div></header><div className="profile-file"><FileXls aria-hidden="true" /><span><strong>{data?.sourceFile?.name ?? "Sample source"}</strong><small>{number(current.rows ?? 80)} data rows · {number(current.columns ?? 7)} columns · {number(current.sheets ?? 1)} worksheet</small></span><StatusPill tone={profiled ? "success" : "attention"}>{profiled ? "Profiled" : "Ready to profile"}</StatusPill></div><div className="profile-facts"><div><small>Detected currency</small><strong>NGN</strong></div><div><small>Date pattern</small><strong>DD MMM YYYY</strong></div><div><small>Header row</small><strong>Row 1</strong></div><div><small>Truth label</small><strong>Sample data</strong></div></div></section><aside><Eyebrow>SOURCE SAMPLE</Eyebrow><div className="source-sample"><span>Stock Ref</span><span>Item</span><span>Trade Cost</span><strong>KLD-PANT-0032</strong><strong>Cassava flour 1 kg</strong><strong>1515.50</strong><strong>KLD-PANT-0002</strong><strong>Long-grain rice 1 kg</strong><strong>547.50</strong></div><div className="upload-boundary"><Info aria-hidden="true" /><span><strong>Merchant SKU candidate detected</strong><small>Stock Ref is a strong candidate for the organisation-scoped Merchant SKU. Mapping still requires review.</small></span></div></aside></div><ImportActionError error={error} /><footer className="ops-sticky-actions"><button type="button" className="ops-secondary" onClick={() => go("upload")}>View source</button><button type="button" className="ops-primary" disabled={Boolean(busyAction)} onClick={() => profileAction?.enabled ? mutate("profile", (idempotencyKey) => repositories.imports.profile({ batchRef: data.ref, idempotencyKey }), (result) => navigateJourney(result.data, "profile")) : go("map")}><span>{busyAction === "profile" ? "Profiling sample…" : profileAction?.enabled ? "Profile sample source" : "Review field mapping"}</span><ArrowRight aria-hidden="true" /></button></footer></Surface> : null}
    {stage === "map" ? <Surface label="Field mapping"><header className="ops-section-head ops-section-head--wide"><span>03</span><div><Eyebrow>FIELD MAPPING</Eyebrow><h2>Match source language to the catalog contract.</h2><p>Examples and transforms remain visible beside every choice.</p></div><StatusPill tone={mappingReviewed ? "success" : current.unmappedRequired?.length ? "danger" : "attention"}>{mappingReviewed ? "Saved" : current.unmappedRequired?.length ? `${current.unmappedRequired.length} required field` : "Review mapping"}</StatusPill></header><MappingTable mappings={current.rows} reviewed={mappingReviewed} reviewContext={current.reviewContext} /><div className="mapping-boundary"><LinkSimple aria-hidden="true" /><span><strong>Template provenance</strong><small>{current.savedTemplate?.name ?? "Supplier cost template"} · version {current.savedTemplate?.version ?? "draft"} · Sample data</small></span>{saveMappingAction?.enabled ? <button type="button" className="ops-secondary" disabled={Boolean(busyAction)} onClick={() => mutate("mapping", (idempotencyKey) => repositories.imports.saveMapping({ batchRef: data.ref, mapping: { tradeCostTarget: "cost.amountMinor", priceTarget: "price.amountMinor", effectiveAt: "2026-08-15T00:00:00+01:00" }, idempotencyKey }), (result) => navigateJourney(result.data, "map"))}>{busyAction === "mapping" ? "Saving reviewed mapping…" : "Save reviewed sample mapping"}</button> : <span className="mapping-reviewed"><CheckCircle aria-hidden="true" />Required fields and import context resolved for validation</span>}</div><ImportActionError error={error} /><footer className="ops-sticky-actions"><button type="button" className="ops-secondary" onClick={() => go("profile")}>Back to profile</button><button type="button" className="ops-primary" disabled={!validateAction?.enabled || Boolean(busyAction)} onClick={() => mutate("validate", (idempotencyKey) => repositories.imports.validate({ batchRef: data.ref, idempotencyKey }), (result) => navigateJourney(result.data, "validate"))}><span>{busyAction === "validate" ? "Validating sample rows…" : `Validate ${number(data?.profile?.rows)} rows`}</span><ArrowRight aria-hidden="true" /></button></footer></Surface> : null}
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
      <header className="ops-section-head ops-section-head--wide"><span>04</span><div><Eyebrow>VALIDATE AND REPAIR</Eyebrow><h2>Every row remains in the accounting.</h2><p>Open an issue to inspect the trusted field, reason and permitted recovery boundary.</p></div><StatusPill tone="danger">{number(counts.invalid)} blocking</StatusPill></header>
      <div className="reconciliation-equation" aria-label="Validation row reconciliation"><div><small>Input</small><strong>{number(counts.input)}</strong></div><i>=</i><div><small>Attempted</small><strong>{number(counts.valid)}</strong></div><i>+</i><div className="is-danger"><small>Unresolved</small><strong>{number(counts.invalid)}</strong></div><i>+</i><div><small>Excluded</small><strong>{number(counts.excluded)}</strong></div><span>{number(counts.warning)} warnings remain inside the attempted set</span></div>
      <div className="issue-toolbar"><div>{[["all", "All issues"], ["error", "Errors"], ["warning", "Warnings"]].map(([id, label]) => <button type="button" key={id} className={filter === id ? "is-active" : ""} aria-pressed={filter === id} onClick={() => { setSelected(null); setFilter(id); }}>{label}</button>)}</div><span>{shown.length} issue examples · full count stays authoritative</span></div>
      <div className="issue-list">{shown.map((issue) => <button type="button" key={issue.rowId ?? `${issue.code}:${rowNumber(issue)}`} className={selected?.rowId === issue.rowId ? "is-selected" : ""} aria-expanded={selected?.rowId === issue.rowId} aria-controls={selected?.rowId === issue.rowId ? "import-issue-inspector" : undefined} onClick={(event) => openSelected(event, issue)}><span className={`issue-mark is-${issue.severity}`}><Warning aria-hidden="true" /></span><span><strong>Row {rowNumber(issue)} · {issue.fieldLabel ?? issue.field}</strong><small>{issue.code}</small></span><span className="issue-raw"><small>Source value</small><strong>Not retained in fixture</strong></span><span className="issue-reason">{issue.message}</span><CaretRight aria-hidden="true" /></button>)}</div>
      <footer className="ops-sticky-actions"><button type="button" className="ops-secondary" onClick={onBack}>Back to mapping</button><button type="button" className="ops-primary" onClick={onContinue}><span>Review bounded commit</span><ArrowRight aria-hidden="true" /></button></footer>
    </div>
    {selected ? <aside ref={issuePeekRef} id="import-issue-inspector" className="ops-peek issue-peek" tabIndex="-1" aria-label={`Issue detail for row ${rowNumber(selected)}`} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeSelected(); } }}><header><div><Eyebrow>{selected.severity === "error" ? "BLOCKING ISSUE" : "WARNING"}</Eyebrow><h2>Row {rowNumber(selected)}</h2><p>{selected.code}</p></div><button type="button" className="ops-icon" onClick={closeSelected} aria-label="Close issue detail"><X aria-hidden="true" /></button></header><dl className="issue-detail"><div><dt>Source field</dt><dd>{selected.fieldLabel ?? selected.field}</dd></div><div><dt>Raw value</dt><dd>Not retained in fixture v0</dd></div><div><dt>Canonical target</dt><dd>{selected.field}</dd></div><div><dt>Reason</dt><dd>{selected.message}</dd></div></dl><div className="repair-suggestion"><PencilSimple aria-hidden="true" /><span><small>Recovery boundary</small><strong>Review the source cell or exclude this row with an accountable reason.</strong></span></div><button type="button" className="ops-primary ops-full" disabled title="The repair mutation contract is not released"><span>Repair contract required</span><LockKey aria-hidden="true" /></button><button type="button" className="ops-secondary ops-full" disabled title="The exclusion mutation contract is not released">Exclude with reason</button></aside> : null}
  </Surface>;
}

function ImportReview({ current, data, busy, error, onBack, onContinue }) {
  const [confirmed, setConfirmed] = useState(false);
  const counts = current.counts ?? data?.counts ?? { input: 1248, valid: 1227, warning: 9, invalid: 12, excluded: 12 };
  const remaining = counts.remaining ?? counts.invalid ?? 0;
  return <Surface label="Import review"><header className="ops-section-head ops-section-head--wide"><span>05</span><div><Eyebrow>REVIEW TRUST BOUNDARY</Eyebrow><h2>Confirm exactly what the bounded operation may attempt.</h2><p>The source file, exact mapping version and unresolved rows remain attached to the Sample data operation.</p></div><StatusPill tone={remaining ? "attention" : "success"}>{remaining ? "Bounded partial result" : "Ready"}</StatusPill></header><div className="review-document"><section><Eyebrow>SOURCE AND MAPPING</Eyebrow><h3>{data?.sourceFile?.name ?? "Sample source"}</h3><dl><div><dt>Import intent</dt><dd>{data?.title ?? "Sample import"}</dd></div><div><dt>Mapping</dt><dd>{data?.mapping?.savedTemplate?.name ?? "Reviewed source mapping"} v{data?.mapping?.savedTemplate?.version ?? data?.ref?.version}</dd></div><div><dt>Source rows</dt><dd>{number(counts.input)}</dd></div><div><dt>Prepared by</dt><dd>Teni · Sample Operator</dd></div></dl></section><section><Eyebrow>EXPECTED CONSEQUENCE</Eyebrow><h3>{number(counts.valid)} rows enter the bounded Sample data attempt.</h3><dl><div><dt>Attempted</dt><dd>{number(counts.valid)}</dd></div><div><dt>Warnings retained</dt><dd>{number(counts.warning)}</dd></div><div><dt>Excluded before attempt</dt><dd>{number(counts.excluded)}</dd></div><div><dt>Unresolved input</dt><dd>{number(remaining)}</dd></div></dl></section></div><div className="review-consequence"><ShieldWarning aria-hidden="true" /><span><strong>{current.consequence ?? `Start a Sample data attempt for ${number(counts.valid)} reviewed rows.`}</strong><small>This acknowledgement opens a separate Commit stage. It does not publish prices or write a live Catalog.</small></span></div><label className="risk-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>I reviewed the mapping, warnings, exclusions and unresolved input.</strong><small>This acknowledges the Sample data consequence and records the exact batch version.</small></span></label><ImportActionError error={error} /><footer className="ops-sticky-actions"><button type="button" className="ops-secondary" onClick={onBack}>Back to validation</button><button type="button" className="ops-primary" disabled={!confirmed || busy} onClick={() => onContinue(true)}><span>{busy ? "Recording acknowledgement…" : "Acknowledge and open Commit"}</span><ArrowRight aria-hidden="true" /></button></footer></Surface>;
}

function ImportCommit({ current, data, busyAction, error, onBack, onCommit, onReconcile }) {
  const operation = current?.operation ?? data?.commit?.operation ?? null;
  const ready = data?.state === "ready-to-commit";
  const awaiting = operation?.state === "unknown-outcome" || data?.state === "awaiting-reconciliation";
  const attempted = operation?.counts?.attempted ?? data?.result?.counts?.attempted ?? data?.review?.counts?.valid ?? 0;
  const pending = "Pending reconciliation";
  return <Surface label="Sample data commit"><header className="ops-section-head ops-section-head--wide"><span>06</span><div><Eyebrow>COMMIT AND STATUS</Eyebrow><h2>{ready ? "Start one idempotent Sample data operation." : "Resolve the operation outcome before showing a result."}</h2><p>The exact batch version, acknowledgement and idempotency key stay attached. A second Commit is never offered.</p></div><StatusPill tone={awaiting ? "attention" : "success"}>{ready ? "Ready" : "Outcome unknown"}</StatusPill></header><div className="review-document"><section><Eyebrow>COMMIT PRECONDITION</Eyebrow><h3>Batch version {data?.ref?.version}</h3><dl><div><dt>Truth label</dt><dd>Sample data</dd></div><div><dt>Attempted rows</dt><dd>{number(attempted)}</dd></div><div><dt>Acknowledgement</dt><dd>{data?.review?.acknowledgement?.acknowledged ? "Recorded" : "Required"}</dd></div><div><dt>Catalog authority</dt><dd>False</dd></div></dl></section><section><Eyebrow>OPERATION STATUS</Eyebrow><h3>{operation ? `Operation ${operation.ref.id}` : "No operation started"}</h3><dl><div><dt>State</dt><dd>{operation ? humanise(operation.state) : "Ready to start"}</dd></div><div><dt>Operation version</dt><dd>{operation?.ref?.version ?? "Not assigned"}</dd></div><div><dt>Persistence</dt><dd>Fixture memory only</dd></div><div><dt>Next authority</dt><dd>{operation ? "Reconciliation" : "Commit"}</dd></div></dl></section></div>{operation ? <div className="result-counts" aria-label="Pending Sample data operation counts"><div><small>Attempted</small><strong>{number(attempted)}</strong></div><div className={operation.counts.committed == null ? "is-pending" : ""}><small>Committed</small><strong>{operation.counts.committed == null ? pending : number(operation.counts.committed)}</strong></div><div className={operation.counts.rejected == null ? "is-pending" : ""}><small>Rejected</small><strong>{operation.counts.rejected == null ? pending : number(operation.counts.rejected)}</strong></div><div className={operation.counts.remaining == null ? "is-pending" : ""}><small>Remaining input</small><strong>{operation.counts.remaining == null ? pending : number(operation.counts.remaining)}</strong></div></div> : null}<div className="review-consequence"><Info aria-hidden="true" /><span><strong>{ready ? "The Commit returns an unknown outcome first." : "The operation must reconcile before a canonical result is displayed."}</strong><small>No live Catalog write is claimed at either state. The resulting evidence remains explicitly Sample data.</small></span></div><ImportActionError error={error} /><footer className="ops-sticky-actions"><button type="button" className="ops-secondary" onClick={onBack}>Back to review</button>{ready ? <button type="button" className="ops-primary" disabled={Boolean(busyAction)} onClick={onCommit}><span>{busyAction === "commit" ? "Starting sample operation…" : "Start sample commit"}</span><ArrowRight aria-hidden="true" /></button> : awaiting ? <button type="button" className="ops-primary" disabled={Boolean(busyAction)} onClick={onReconcile}><span>{busyAction === "reconcile" ? "Reconciling operation…" : "Reconcile sample operation"}</span><ArrowRight aria-hidden="true" /></button> : null}</footer></Surface>;
}

function ImportResult({ current, data, onNavigate }) {
  const counts = current.counts ?? data?.result?.counts ?? { attempted: 1236, committed: 1227, rejected: 9, remaining: 9 };
  const partial = Number(counts.rejected ?? counts.remaining) > 0;
  return <Surface label="Import result"><div className="result-hero"><span className={partial ? "is-attention" : "is-success"}>{partial ? <Warning aria-hidden="true" /> : <SealCheck aria-hidden="true" />}</span><Eyebrow>{partial ? "SAMPLE DATA · PARTIAL RESULT" : "SAMPLE DATA · RECONCILED"}</Eyebrow><h2>{partial ? "Accepted fixture records are accounted for. Unresolved rows remain recoverable." : "Every intended Sample data record is accounted for."}</h2><p>Operation {current.operationId ?? data?.operationId ?? "Unavailable"} · Reconciled fixture result</p></div><div className="result-counts"><div><small>Attempted</small><strong>{number(counts.attempted)}</strong></div><div><small>Committed in fixture</small><strong>{number(counts.committed)}</strong></div><div className={partial ? "is-danger" : ""}><small>Rejected</small><strong>{number(counts.rejected)}</strong></div><div><small>Remaining input</small><strong>{number(counts.remaining)}</strong></div></div>{partial ? <div className="persistent-recovery"><ShieldWarning aria-hidden="true" /><span><strong>{number(counts.rejected)} attempted rows were rejected and {number(counts.remaining)} source rows remain unresolved.</strong><small>The reconciled fixture will not retry committed sample rows. No released live export, retry or Catalog mutation is claimed.</small></span><button type="button" onClick={() => onNavigate({ surface: "import-validate", resourceId: data?.ref?.id ?? "FX-003", resourceVersion: data?.ref?.version, view: "validate" })}>Review unresolved input</button></div> : null}<div className="result-next"><button type="button" className="ops-secondary" onClick={() => onNavigate({ surface: "imports", view: "ledger" })}>Return to ledger</button><button type="button" className="ops-primary" onClick={() => onNavigate({ surface: "catalog", view: "list" })}><span>Open Sample data catalog</span><ArrowRight aria-hidden="true" /></button></div></Surface>;
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
    <ScreenHeader eyebrow="REPRICING · SCOPE" title="Define scope" description="Choose the catalog population." />
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
    <button type="button" className="ops-back" onClick={() => onNavigate({ surface: "repricing-scope", resourceId: "new", view: "scope" })}><ArrowLeft aria-hidden="true" />Scope</button>
    <ScreenHeader eyebrow="REPRICING · ADJUSTMENT" title="Set adjustment" description="Choose the price movement and effective time." />
    <div className="rule-layout"><Surface label="Price adjustment"><header className="ops-section-head"><span>02</span><div><Eyebrow>ADJUSTMENT METHOD</Eyebrow><h2>Move every selected price consistently.</h2></div></header><div className="rule-switch"><button type="button" disabled={!editAction?.enabled || busy} className={type === "percentage" ? "is-selected" : ""} onClick={() => selectType("percentage")}>Percentage</button><button type="button" disabled={!editAction?.enabled || busy} className={type === "absolute" ? "is-selected" : ""} onClick={() => selectType("absolute")}>Absolute NGN</button></div><label className="rule-value"><span>{type === "percentage" ? "Percentage increase" : "Amount increase"}</span><div><input value={value} disabled={!editAction?.enabled || busy} onChange={(event) => setValue(event.target.value)} inputMode="decimal" aria-describedby="adjustment-hint" /><strong>{type === "percentage" ? "%" : "NGN"}</strong></div><small id="adjustment-hint">{valid ? editAction?.enabled ? `${preparedRule.label} has complete sample evidence.` : editAction?.reason?.message : exactHundredths === null && value ? "Use a positive value with no more than two decimal places." : "Prepared outcomes: 3.50%, 4.25%, or NGN 25.00."}</small></label><label className="rule-date"><span>Effective date and time</span><input type="datetime-local" value={effectiveAt} disabled={!editAction?.enabled || busy} onChange={(event) => setEffectiveAt(event.target.value)} /></label>{dirty ? <div className="rule-dirty"><Warning aria-hidden="true" /><span><strong>New preview required.</strong><small>Save this adjustment as a new version.</small></span><button type="button" className="ops-secondary" disabled={busy} onClick={restore}>Restore saved adjustment</button></div> : savedVersion ? <div className="rule-dirty"><CheckCircle aria-hidden="true" /><span><strong>Adjustment version {savedVersion} saved.</strong><small>Generate its exact Preview.</small></span></div> : null}{mutationError ? <div className="rule-dirty" role="alert"><ShieldWarning aria-hidden="true" /><span><strong>Adjustment not saved.</strong><small>{mutationError.error.message}</small></span></div> : null}</Surface><Surface className="rule-explanation" label="Adjustment consequence"><header><Eyebrow>PRICE CONSEQUENCE</Eyebrow><h2>Increase each selected NGN price by {renderedValue}.</h2><p>{dirty ? "Save before generating a new Preview." : persisted?.explanation}</p></header><div className="rule-proof"><FunctionIconFallback /><span><small>Calculation</small><strong>Deterministic minor-unit arithmetic</strong><em>The Preview records the formula and rounding.</em></span></div><div className="rule-proof"><ShieldCheck aria-hidden="true" /><span><small>Margin policy evaluation</small><strong>Most specific policy wins</strong><em>SKU, channel, category, then organisation. Every result keeps its applied policy evidence.</em></span></div><button type="button" className="ops-primary ops-full" disabled={primaryDisabled} onClick={dirty ? persistRule : openOrGeneratePreview}><span>{primaryLabel.replaceAll("Rule", "adjustment")}</span><ArrowRight aria-hidden="true" /></button></Surface></div>
  </>;
}

function FunctionIconFallback() { return <SlidersHorizontal aria-hidden="true" />; }

function ProposalListScreen({ data, onNavigate }) {
  const [view, setView] = useState("needs-me");
  const [query, setQuery] = useState("");
  const items = list(data?.items);
  const views = [["needs-me", "Needs me"], ["blocked", "Blocked"], ["awaiting-approval", "Awaiting approval"], ["approved", "Approved to publish"], ["published", "Published"]];
  const stateMatches = (item) => view === "needs-me" || (view === "awaiting-approval" ? item.state === "submitted" : item.state === view);
  const shown = items.filter(stateMatches).filter((item) => !query || `${item.title} ${item.state} ${item.readiness}`.toLowerCase().includes(query.toLowerCase()));
  const awaitingCount = items.filter((item) => item.state === "submitted").length;
  const approvedCount = items.filter((item) => item.state === "approved").length;
  return <>
    <ScreenHeader eyebrow="PROPOSALS" title="Proposals" description="Review, approve and publish price changes.">
      <button type="button" className="ops-primary" onClick={() => onNavigate({ surface: "repricing-scope", resourceId: "new", view: "scope" })}><span>New repricing</span><ArrowRight aria-hidden="true" /></button>
    </ScreenHeader>
    <Surface label="Proposal queue"><header className="ops-toolbar"><div className="ops-tabs">{views.map(([id, label]) => <button type="button" key={id} className={view === id ? "is-active" : ""} onClick={() => setView(id)}>{label}<span>{id === "needs-me" ? items.length : items.filter((item) => id === "awaiting-approval" ? item.state === "submitted" : item.state === id).length}</span></button>)}</div><label className="ops-search"><MagnifyingGlass aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search proposals" /></label></header><div className="proposal-list"><div className="proposal-list__head"><span>Proposal</span><span>State and blocker</span><span>Scope</span><span>Authority</span><span>Release</span><span>Updated</span><span /></div>{shown.map((item) => <button type="button" key={item.ref.id} onClick={() => onNavigate({ surface: "proposal", resourceId: item.ref.id, resourceVersion: item.ref.version, view: "overview" })}><span><strong>{item.title}</strong><small>Proposal · v{item.ref.version}</small></span><span><StatusPill tone={item.state === "blocked" ? "danger" : item.state === "approved" || item.state === "published" ? "success" : "attention"}>{humanise(item.state)}</StatusPill>{item.readiness !== item.state ? <small>{humanise(item.readiness)}</small> : null}</span><span><strong>{item.counts.lines == null ? "Scope unavailable" : `${number(item.counts.lines)} lines`}</strong><small>{item.counts.blocked == null ? "Requires current version" : `${number(item.counts.blocked)} requiring authority`}</small></span><span><small>Owner</small><strong>{shortActorName(item.owner?.displayName)}</strong><em>Approver {shortActorName(item.assignedApprover?.displayName)}</em></span><span><small>Publisher</small><strong>{shortActorName(item.assignedPublisher?.displayName)}</strong></span><span>{dateTime(item.updatedAt)}</span><CaretRight aria-hidden="true" /></button>)}</div>{!shown.length ? <EmptyBoundary title="No Proposals match this view." detail="The object state and current authority determine where a Proposal appears." actionLabel={query ? "Clear search" : "Show all"} onAction={() => query ? setQuery("") : setView("needs-me")} /> : null}<footer className="ops-summary-strip" aria-label="Proposal queue summary"><span><small>Current view</small><strong>{number(shown.length)} shown</strong></span><span><small>Awaiting review</small><strong>{number(awaitingCount)}</strong></span><span><small>Approved to publish</small><strong>{number(approvedCount)}</strong></span></footer></Surface>
  </>;
}

function RulesScreen({ data, detail, onNavigate }) {
  if (detail) {
    return <><button type="button" className="ops-back" onClick={() => onNavigate({ surface: "rules", view: "read" })}><ArrowLeft aria-hidden="true" />Margin policies</button><ScreenHeader eyebrow="MARGIN POLICY" title={data?.name ?? "Margin floor"} description={data?.explanation ?? "Read-only policy evidence."} meta={<><StatusPill tone="success">{displayRuleVersion(data?.ref?.version)}</StatusPill><span>{humanise(data?.scope ?? "global")}</span></>} /><div className="record-layout"><Surface label="Margin policy definition"><div className="rule-detail-value"><small>Minimum gross margin</small><strong>{ruleValue(data)}</strong><span>Evaluated after the adjustment</span></div><div className="ops-detail-grid"><div><dt>Code</dt><dd>{data?.code}</dd></div><div><dt>Precedence</dt><dd>{humanise(data?.scope)}</dd></div><div><dt>Status</dt><dd>{humanise(data?.status)}</dd></div><div><dt>Access</dt><dd>Read only</dd></div></div></Surface><Surface label="Margin policy evidence"><header className="ops-section-head"><span>02</span><div><Eyebrow>VERSIONED EVIDENCE</Eyebrow><h2>Why this policy can apply.</h2></div></header><div className="rule-usage"><div><ShieldCheck aria-hidden="true" /><span><strong>{data?.code ?? "Policy code unavailable"} · {displayRuleVersion(data?.ref?.version)}</strong><small>{humanise(data?.scope ?? "global")} precedence</small></span></div><div><GitBranch aria-hidden="true" /><span><strong>Bound at evaluation</strong><small>The Preview keeps the exact winning policy and version.</small></span></div></div></Surface></div></>;
  }
  const items = list(data?.items);
  return <><ScreenHeader eyebrow="POLICY" title="Margin policies" description="Versioned floors and precedence." /><Surface label="Margin policies"><div className="rules-list"><div className="rules-list__head"><span>Policy</span><span>Precedence</span><span>Floor</span><span>Version</span><span>Status</span><span /></div>{items.map((item) => <button type="button" key={item.id} onClick={() => onNavigate({ surface: "rule-detail", resourceId: item.id, view: "read" })}><span><RuleScopeIcon scope={item.scope} /><span><strong>{item.name}</strong><small>{item.code}</small></span></span><span>{humanise(item.scope)}</span><strong className="rule-floor" style={{ "--rule-floor-progress": ruleFloorProgress(item) }}>{ruleValue(item)}</strong><span title={`Exact version ${item.ref?.version ?? "unavailable"}`}>{displayRuleVersion(item.ref?.version)}</span><span>{humanise(item.status)}</span><CaretRight aria-hidden="true" /></button>)}</div></Surface></>;
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
  if (route.surface === "catalog") return <CatalogScreen data={data} catalog={repositories.catalog} onNavigate={onNavigate} />;
  if (route.surface === "catalog-detail") return <CatalogDetailScreen data={data} onNavigate={onNavigate} />;
  if (route.surface === "imports") return <ImportsLedger data={data} onNavigate={onNavigate} />;
  if (route.surface.startsWith("import-")) return <ImportJourney data={data} route={route} repositories={repositories} onNavigate={onNavigate} />;
  if (route.surface === "repricing-scope") return <ScopeScreen data={data} repricing={repositories.repricing} onNavigate={onNavigate} />;
  if (route.surface === "repricing-rule") return <RuleScreen data={data} repricing={repositories.repricing} onNavigate={onNavigate} />;
  if (route.surface === "proposals") return <ProposalListScreen data={data} onNavigate={onNavigate} />;
  if (route.surface === "rules") return <RulesScreen data={data} onNavigate={onNavigate} />;
  if (route.surface === "rule-detail") return <RulesScreen data={data} detail onNavigate={onNavigate} />;
  if (route.surface === "audit") return <AuditScreen data={data} onNavigate={onNavigate} />;
  if (route.surface === "audit-detail") return <AuditScreen data={data} detail onNavigate={onNavigate} />;
  return <EmptyBoundary title="This route is not available." detail="Return to the Work Queue to continue the governed journey." actionLabel="Open Work Queue" onAction={() => onNavigate({ surface: "work", view: "needs-me" })} />;
}
