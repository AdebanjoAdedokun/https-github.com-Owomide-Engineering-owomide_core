import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/noto-sans";
import {
  ArrowSquareOut,
  ArrowRight,
  CaretDown,
  CaretRight,
  CheckCircle,
  ClockCounterClockwise,
  Database,
  FileCsv,
  FunnelSimple,
  Function as FunctionIcon,
  GitBranch,
  GridFour,
  House,
  Info,
  List,
  ListChecks,
  LockKey,
  MagnifyingGlass,
  MinusCircle,
  Rows,
  SealCheck,
  ShieldCheck,
  ShieldWarning,
  SignOut,
  SlidersHorizontal,
  Storefront,
  Tag,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { findAllowedAction } from "./data/contracts.js";
import { createWorkspaceRepositories } from "./data/workspaceRepositories.js";
import { createDomainErrorEnvelope, RepositoryError, toDomainErrorEnvelope } from "./data/domainError.js";
import { WORKSPACE_RUNTIME_CONFIG } from "./runtimeConfig.js";
import { parseWorkspaceHash, routeFromReturnTo, routeNavigationKey, workspaceHash } from "./workspaceRouting.js";
import { ProposalWorkspace } from "./ProposalWorkspace.jsx";
import { LoginScreen, OperationalWorkspace } from "./OperationalWorkspace.jsx";
import { CursorPager, INSPECTOR_DOCK_MIN_SURFACE } from "./workspaceTablePatterns.jsx";
import {
  initials,
  formatBasisPoints,
  formatEffectiveAt,
  formatMoney,
  formatSignedMoney,
  presentRepricingLine,
  repricingRuleLabel,
  presentRoleCodes,
  shortActorName,
  shortOrganisationName,
} from "./workspacePresenter.js";

const NAV_GROUPS = [
  { label: "Work", items: [{ label: "Work queue", icon: House }] },
  { label: "Data", items: [
    { label: "Catalog", icon: Database, requiredAny: ["catalog:read"] },
    { label: "Imports", icon: UploadSimple, requiredAny: ["import:prepare"] },
  ] },
  { label: "Decisions", items: [
    { label: "Repricing", icon: FunctionIcon, requiredAny: ["repricing:prepare"] },
    { label: "Proposals", icon: ListChecks, requiredAny: ["proposal:submit", "proposal:review", "proposal:read", "publish:execute"] },
  ] },
  { label: "Control", items: [
    { label: "Margin policies", icon: SlidersHorizontal, requiredAny: ["rules:read"] },
    { label: "Audit", icon: ClockCounterClockwise, requiredAny: ["audit:read", "proposal:read"] },
  ] },
];

function visibleNavigationGroups(session) {
  const capabilities = new Set(session?.effectiveCapabilities ?? []);
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.requiredAny || item.requiredAny.some((capability) => capabilities.has(capability))),
  })).filter((group) => group.items.length);
}

function activeNavigationLabel(surface) {
  if (surface === "work") return "Work queue";
  if (surface === "catalog" || surface === "catalog-detail") return "Catalog";
  if (surface === "imports" || surface.startsWith("import-")) return "Imports";
  if (surface === "repricing" || surface.startsWith("repricing-")) return "Repricing";
  if (surface === "proposals" || surface.startsWith("proposal") || surface === "publication" || surface === "operation") return "Proposals";
  if (surface === "rules" || surface === "rule-detail") return "Margin policies";
  if (surface === "audit" || surface === "audit-detail") return "Audit";
  return "Work queue";
}

const SUMMARY_FIELDS = [
  ["In scope", "total", Database, "neutral"],
  ["Selected", "selected", CheckCircle, "green"],
  ["Eligible", "eligible", SealCheck, "green"],
  ["Need review", "blocked", ShieldWarning, "red"],
  ["Excluded", "excluded", MinusCircle, "neutral"],
  ["Unpriced", "unpriced", Tag, "gold"],
];

const REPRICING_VIEWS = ["all", "review", "eligible", "excluded", "unpriced"];
const REPRICING_PAGE_LIMIT = 6;
const OPERATIONAL_SURFACES = new Set([
  "work", "catalog", "catalog-detail", "imports", "import-new", "import-upload", "import-profile", "import-map", "import-validate", "import-review", "import-commit", "import-result",
  "repricing-scope", "repricing-rule", "proposals", "rules", "rule-detail", "audit", "audit-detail",
]);
const SEARCHABLE_OPERATIONAL_SURFACES = new Set(["work", "catalog", "imports", "proposals", "audit"]);
const GOVERNED_SURFACES = new Set(["proposal", "proposal-override", "proposal-approval", "proposal-publish", "publication", "operation"]);

function navigateExternalDestination(href) {
  window.location.assign(href);
}

function classificationForView(view) {
  return view === "review" ? "blocked" : view;
}

function safeMoney(money, locale) {
  if (!money || money.amountMinor == null || !money.currency) return "—";
  try {
    return formatMoney(money, locale);
  } catch {
    return "—";
  }
}

function safeBasisPoints(value) {
  return Number.isFinite(value) ? formatBasisPoints(value) : "—";
}

function safeSignedMoney(money, locale) {
  if (!money || money.amountMinor == null || !money.currency) return "—";
  try {
    return formatSignedMoney(money, locale);
  } catch {
    return "—";
  }
}

function presentPreviewLine(line, locale) {
  let presented;
  try {
    presented = presentRepricingLine(line, locale);
  } catch {
    presented = {
      id: line.id,
      sku: line.merchantSku ?? line.sku ?? "SKU unavailable",
      product: line.product?.name ?? "Product unavailable",
      variant: line.product?.variant ?? "Variant unavailable",
      scope: [line.scope?.channel?.name, line.scope?.location?.name].filter(Boolean).join(" · ") || "Scope unavailable",
      channelId: line.scope?.channel?.id,
      channel: line.scope?.channel?.name,
      locationId: line.scope?.location?.id,
      location: line.scope?.location?.name,
      cost: safeMoney(line.currentCost, locale),
      current: safeMoney(line.currentPrice, locale),
      proposed: safeMoney(line.proposedPrice, locale),
      delta: safeSignedMoney(line.absoluteDelta, locale),
      margin: safeBasisPoints(line.currentMarginBasisPoints),
      proposedMargin: safeBasisPoints(line.proposedMarginBasisPoints),
      floor: safeBasisPoints(line.policy?.floorBasisPoints),
      floorPrice: safeMoney(line.policy?.floorPrice, locale),
      marginGapBasisPoints: Number.isFinite(line.policy?.floorBasisPoints) && Number.isFinite(line.proposedMarginBasisPoints)
        ? line.policy.floorBasisPoints - line.proposedMarginBasisPoints
        : null,
      status: line.classification === "blocked" ? "review" : line.classification,
      sourceRow: line.provenance?.rowNumber == null ? "—" : String(line.provenance.rowNumber),
      catalogVersion: line.provenance?.catalogVersion ?? "—",
    };
  }

  const floorBasisPoints = line.policy?.floorBasisPoints;
  const proposedMarginBasisPoints = line.proposedMarginBasisPoints;

  return {
    ...presented,
    cost: safeMoney(line.currentCost, locale),
    current: safeMoney(line.currentPrice, locale),
    proposed: safeMoney(line.proposedPrice, locale),
    delta: safeSignedMoney(line.absoluteDelta, locale),
    margin: safeBasisPoints(line.currentMarginBasisPoints),
    proposedMargin: safeBasisPoints(proposedMarginBasisPoints),
    floor: safeBasisPoints(floorBasisPoints),
    floorPrice: safeMoney(line.policy?.floorPrice, locale),
    marginGapBasisPoints: Number.isFinite(floorBasisPoints) && Number.isFinite(proposedMarginBasisPoints)
      ? floorBasisPoints - proposedMarginBasisPoints
      : null,
    classification: presented.classification ?? line.classification ?? (presented.status === "review" ? "blocked" : "eligible"),
    selected: presented.selected ?? line.selected ?? false,
    costState: presented.costState ?? line.costState ?? (line.currentCost ? "current" : "missing"),
    issue: presented.issue ?? line.issue ?? null,
    policy: presented.policy ?? line.policy ?? null,
    policyEvaluation: presented.policyEvaluation ?? line.policy?.evaluation ?? null,
    allowedRemediations: presented.allowedRemediations ?? line.issue?.allowedRemediations ?? [],
    raw: line,
  };
}

function issueKindFor(row) {
  const rawKind = row.issue?.kind
    ?? row.blockerKind
    ?? row.raw?.issue?.kind
    ?? row.raw?.policy?.violation?.code
    ?? (row.classification === "excluded" ? "excluded" : null)
    ?? (row.classification === "unpriced" ? "unpriced" : null);
  const kind = String(rawKind ?? "").toLowerCase().replaceAll("_", "-");
  if (kind.includes("stale") || row.costState === "stale") return "stale-cost";
  if (kind.includes("dimension")) return "unsupported-dimension";
  if (kind.includes("margin") || kind.includes("floor")) return "margin-policy";
  if (kind.includes("excluded")) return "excluded";
  if (kind.includes("unpriced") || row.costState === "missing") return "unpriced";
  if (row.classification === "blocked") return "review";
  return row.classification ?? "eligible";
}

const DECISION_COPY = Object.freeze({
  eligible: { label: "Eligible", eyebrow: "Policy clear", tone: "eligible", Icon: CheckCircle },
  "margin-policy": { label: "Margin policy", eyebrow: "Policy exception", tone: "review", Icon: ShieldWarning },
  "stale-cost": { label: "Stale cost", eyebrow: "Evidence issue", tone: "stale", Icon: ClockCounterClockwise },
  "unsupported-dimension": { label: "Unsupported dimension", eyebrow: "Scope issue", tone: "dimension", Icon: GridFour },
  excluded: { label: "Excluded", eyebrow: "Outside proposal", tone: "excluded", Icon: MinusCircle },
  unpriced: { label: "Unpriced", eyebrow: "Price unavailable", tone: "unpriced", Icon: Tag },
  review: { label: "Needs review", eyebrow: "Policy exception", tone: "review", Icon: ShieldWarning },
});

function decisionFor(row) {
  return DECISION_COPY[issueKindFor(row)] ?? DECISION_COPY.review;
}

function matchingChainLabel(entry, index) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return `Candidate ${index + 1}`;
  const rule = entry.appliedRule ?? entry.rule ?? entry;
  const name = rule.name ?? rule.label ?? rule.code ?? rule.id ?? `Candidate ${index + 1}`;
  const scope = rule.scope ?? rule.level ?? entry.scope;
  const outcome = entry.outcome ?? entry.result ?? (entry.matched === false ? "not matched" : "matched");
  return [name, scope, outcome].filter(Boolean).join(" · ");
}

function policyEvidenceFor(row) {
  const policy = row.policy ?? row.raw?.policy ?? {};
  const evaluation = row.policyEvaluation ?? policy.evaluation ?? {};
  const applied = evaluation.appliedRule ?? row.appliedPolicy ?? policy.appliedRule ?? null;
  const chain = evaluation.matchingChain ?? row.matchingChain ?? [];
  return {
    status: evaluation.status ?? (applied ? "matched" : "not-required"),
    name: applied?.name ?? applied?.label ?? row.policyName ?? null,
    code: applied?.code ?? applied?.id ?? row.policyCode ?? policy.sourceId ?? null,
    version: applied?.version ?? row.policyVersion ?? null,
    scope: applied?.scope ?? applied?.level ?? row.policyScope ?? policy.scope ?? null,
    explanation: evaluation.explanation ?? row.policyExplanation ?? null,
    matchingChain: Array.isArray(chain) ? chain : [],
  };
}

function remediationDescriptor(action) {
  const source = typeof action === "string" ? { code: action, enabled: true } : action ?? {};
  const rawCode = source.code ?? source.action ?? source.id ?? "";
  const code = String(rawCode).toLowerCase().replaceAll("_", "-");
  const definitions = {
    "apply-floor": { label: "Apply floor price", Icon: ShieldCheck },
    exclude: { label: "Exclude line", Icon: MinusCircle },
    "refresh-cost": { label: "Refresh cost", Icon: ClockCounterClockwise },
    "repair-dimension": { label: "Repair dimension", Icon: GridFour },
  };
  const definition = definitions[code];
  if (!definition) return null;
  return {
    ...definition,
    code,
    enabled: source.enabled !== false,
    reason: source.reason?.message ?? source.reason ?? null,
  };
}

function filterRequestKey({ ref, classification, query, channelId, locationId }) {
  return JSON.stringify({
    previewId: ref?.id ?? null,
    previewVersion: ref?.version ?? null,
    classification,
    query: query.trim(),
    channelId: channelId === "all" ? null : channelId,
    locationId: locationId === "all" ? null : locationId,
  });
}

function previewRequestForRoute(route) {
  if (route.surface !== "repricing") return null;
  const resourceId = route.resourceId ?? "FX-004";
  const canonicalBootstrap = resourceId === "FX-004" && !route.resourceVersion;
  if (canonicalBootstrap) return { limit: route.lineId ? 200 : REPRICING_PAGE_LIMIT };
  if (!route.resourceVersion) {
    throw new RepositoryError(createDomainErrorEnvelope({
      code: "REPRICING_PREVIEW_ROUTE_VERSION_REQUIRED",
      message: "This Preview link must identify the exact persisted Preview version.",
      details: { resourceId },
      retryable: false,
      domain: "repricing-route",
      traceId: "workspace-repricing-preview-version-required",
    }));
  }
  return {
    ref: {
      kind: resourceId === "FX-004" ? "fixture-scenario" : "resource",
      id: resourceId,
      version: route.resourceVersion,
    },
    limit: route.lineId ? 200 : REPRICING_PAGE_LIMIT,
  };
}

function protectedRouteVersionError({ surface, resourceId, resourceVersion, operationId, operationVersion, overrideId, overrideVersion, view }) {
  const proposalEvidenceVersionRequired = surface === "proposal" && (view === "margin" || view === "comments");
  const proposalVersionRequired = proposalEvidenceVersionRequired || surface === "proposal-override" || surface === "proposal-approval" || surface === "proposal-publish" || surface === "publication";
  const operationVersionRequired = surface === "publication" || surface === "operation";
  const overrideVersionRequired = surface === "proposal-override";
  const proposalVersionMissing = proposalVersionRequired && (!resourceId || !resourceVersion);
  const operationVersionMissing = operationVersionRequired && (!operationId || !operationVersion);
  const overrideVersionMissing = overrideVersionRequired && (!overrideId || !overrideVersion);
  if (!proposalVersionMissing && !operationVersionMissing && !overrideVersionMissing) return null;
  return createDomainErrorEnvelope({
    code: "GOVERNED_ROUTE_VERSION_REQUIRED",
    message: overrideVersionMissing
      ? "This protected exception link must identify the exact Proposal and exception versions."
      : operationVersionMissing
      ? "This protected publication link must identify the exact Proposal and operation versions."
      : proposalEvidenceVersionRequired
        ? "This evidence view must identify the exact Proposal version."
        : "This protected review link must identify the exact Proposal version.",
    details: {
      surface,
      missingProposalVersion: proposalVersionMissing,
      proposalEvidenceView: proposalEvidenceVersionRequired ? view : null,
      missingOperationVersion: operationVersionMissing,
      missingOverrideVersion: overrideVersionMissing,
    },
    retryable: false,
    domain: "governance-route",
    traceId: "workspace-governed-route-version-required",
  });
}

function sourceEvidenceError(message, details = {}) {
  return new RepositoryError(createDomainErrorEnvelope({
    code: "PROPOSAL_SOURCE_EVIDENCE_MISMATCH",
    message,
    details,
    retryable: false,
    domain: "proposal-evidence",
    traceId: "workspace-proposal-source-evidence-mismatch",
  }));
}

function AppMark() {
  return <img src="/assets/owomide-wordmark.png" alt="Owómidé" />;
}

function SideNavigation({ openPanel, onPanelChange, onNavigate, session, activeLabel, collapsed, onToggleCollapsed }) {
  const organisationName = shortOrganisationName(session?.organisation.name ?? "Workspace loading");
  const organisationInitials = initials(organisationName);
  return (
    <aside className="side-nav" aria-label="Workspace navigation">
      <button type="button" className="side-nav__brand" aria-label="Open Work queue" onClick={() => onNavigate("Work queue")}><AppMark /></button>
      <div className="side-nav__workspace-shell">
        <button className="side-nav__workspace" type="button" aria-label={`Open ${organisationName} workspace details`} aria-expanded={openPanel === "workspace"} aria-controls="workspace-details" onClick={() => onPanelChange(openPanel === "workspace" ? null : "workspace")}>
          <span className="workspace-monogram">{organisationInitials}</span>
          <span><strong>{organisationName}</strong><small>Nigeria operations</small></span>
          <CaretDown aria-hidden="true" />
        </button>
        {openPanel === "workspace" ? <section className="workspace-popover" id="workspace-details" role="region" aria-label="Workspace details">
          <header><span className="workspace-monogram">{organisationInitials}</span><span><small>Workspace</small><strong>{organisationName}</strong></span></header>
          <dl><div><dt>Currency</dt><dd>{session?.organisation.baseCurrency ?? "Resolving"}</dd></div><div><dt>Timezone</dt><dd>{session?.organisation.timezone ?? "Resolving"}</dd></div><div><dt>Environment</dt><dd>Sample</dd></div></dl>
          <div className="popover-boundary"><span aria-hidden="true" /><p><strong>Demo environment</strong><small>Fictional data · No live writes</small></p></div>
          <button type="button" className="popover-close" onClick={() => onPanelChange(null)}>Close</button>
        </section> : null}
      </div>
      <nav>
        {visibleNavigationGroups(session).map((group) => (
          <section key={group.label}>
            <p>{group.label}</p>
            {group.items.map(({ label, icon: Icon }) => (
              <button className={label === activeLabel ? "is-active" : ""} type="button" key={label} aria-label={label} aria-current={label === activeLabel ? "page" : undefined} onClick={() => onNavigate(label)}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </section>
        ))}
      </nav>
      <button type="button" className="side-nav__collapse" onClick={onToggleCollapsed} aria-label={collapsed ? "Expand workspace navigation" : "Collapse workspace navigation"} aria-pressed={collapsed}>
        <CaretRight aria-hidden="true" />
        <span>{collapsed ? "Expand" : "Collapse"}</span>
      </button>
    </aside>
  );
}

function TopBar({
  openPanel,
  onPanelChange,
  onSignOut,
  session,
  marketingHref,
  routeLabel,
  evidenceActors = [],
  onSelectEvidenceActor,
}) {
  const actorName = shortActorName(session?.actor.displayName ?? "Resolved user");
  const actorInitials = initials(actorName);
  const roleLabels = presentRoleCodes(session?.roleCodes);
  const roleSummary = roleLabels.length ? roleLabels.join(" · ") : "Resolving membership";
  return (
    <header className="topbar">
      <div className="topbar__mobile-start">
        <button type="button" className="mobile-nav-trigger" aria-label="Open workspace navigation" aria-expanded={openPanel === "mobile"} aria-controls="mobile-workspace-navigation" onClick={() => onPanelChange(openPanel === "mobile" ? null : "mobile")}><List aria-hidden="true" /></button>
        <div className="mobile-brand"><AppMark /></div>
      </div>
      <div className="topbar__route-context"><span>{routeLabel}</span></div>
      <div className="topbar__actions">
        <div className="identity-shell">
          <button type="button" className="resolved-identity" aria-label="Open session identity details" aria-expanded={openPanel === "identity"} aria-controls="identity-details" onClick={() => onPanelChange(openPanel === "identity" ? null : "identity")}>
            <span className="avatar">{actorInitials}</span>
            <span><strong>{actorName}</strong><small title={roleSummary}>{roleSummary}</small></span>
            <CaretDown aria-hidden="true" />
          </button>
          {openPanel === "identity" ? <button type="button" className="identity-scrim" aria-label="Close account menu" onClick={() => onPanelChange(null)} /> : null}
          {openPanel === "identity" ? <section className="identity-popover" id="identity-details" role="region" aria-label="Session identity">
            <header><span className="avatar">{actorInitials}</span><span><small>Signed in</small><strong>{actorName}</strong></span></header>
            <div className="identity-membership"><small>Roles</small>{roleLabels.map((role) => <span key={role}>{role}</span>)}</div>
            <div className="identity-capability"><ShieldCheck aria-hidden="true" /><p><strong>Permissions</strong><small>Actions adapt to your role and the current record.</small></p></div>
            {evidenceActors.length > 1 && onSelectEvidenceActor ? <details className="identity-evidence-harness">
              <summary>Preview another role</summary>
              <div>{evidenceActors.map((actorSession) => <button type="button" key={actorSession.actor.id} className={actorSession.actor.id === session?.actor.id ? "is-current" : ""} aria-pressed={actorSession.actor.id === session?.actor.id} onClick={() => onSelectEvidenceActor(actorSession.actor.id)}><span className="avatar">{initials(shortActorName(actorSession.actor.displayName))}</span><span><strong>{shortActorName(actorSession.actor.displayName)}</strong><small>{presentRoleCodes(actorSession.roleCodes).join(" · ")}</small></span></button>)}</div>
            </details> : null}
            <div className="identity-actions"><a href={marketingHref}><ArrowSquareOut aria-hidden="true" />Back to website</a><button type="button" onClick={onSignOut}><SignOut aria-hidden="true" />Sign out</button></div>
          </section> : null}
        </div>
      </div>
    </header>
  );
}

function MobileNavigation({ onClose, onNavigate, onSignOut, marketingHref, session, activeLabel }) {
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector("button")?.focus();

    const trapFocus = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => {
      window.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  const organisationName = shortOrganisationName(session?.organisation.name ?? "Workspace loading");
  const actorName = shortActorName(session?.actor.displayName ?? "Resolved user");
  const roleLabels = presentRoleCodes(session?.roleCodes);

  return <aside ref={panelRef} className="mobile-navigation" id="mobile-workspace-navigation" role="dialog" aria-modal="true" aria-label="Workspace navigation">
    <header><AppMark /><button type="button" className="icon-control" onClick={onClose} aria-label="Close workspace navigation"><X aria-hidden="true" /></button></header>
    <button type="button" className="mobile-navigation__workspace" onClick={() => onNavigate("Workspace details")}><span className="workspace-monogram">{initials(organisationName)}</span><span><strong>{organisationName}</strong><small>Nigeria operations</small></span><CaretRight aria-hidden="true" /></button>
    <nav>
      {visibleNavigationGroups(session).map((group) => <section key={group.label}><p>{group.label}</p>{group.items.map(({ label, icon: Icon }) => <button className={label === activeLabel ? "is-active" : ""} type="button" key={label} aria-current={label === activeLabel ? "page" : undefined} onClick={() => onNavigate(label)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</section>)}
    </nav>
    <footer className="mobile-navigation__account"><div><span className="avatar">{initials(actorName)}</span><span><strong>{actorName}</strong><small>{roleLabels.length ? roleLabels.join(" · ") : "Resolving membership"}</small></span></div><div className="mobile-navigation__account-actions"><a href={marketingHref}><ArrowSquareOut aria-hidden="true" />Website</a><button type="button" onClick={onSignOut}><SignOut aria-hidden="true" />Sign out</button></div></footer>
  </aside>;
}

function ScopeSummary({ counts }) {
  return (
    <div className="scope-summary" aria-label="Complete repricing population">
      {SUMMARY_FIELDS.map(([label, field, Icon, tone]) => (
        <div className={`scope-stat is-${tone}`} key={label}>
          <Icon aria-hidden="true" />
          <span><small>{label}</small><strong>{counts[field].toLocaleString("en-NG")}</strong></span>
        </div>
      ))}
    </div>
  );
}

function Status({ row }) {
  const decision = decisionFor(row);
  const Icon = decision.Icon;
  const needsReview = row.classification === "blocked";
  return <span className={`row-status is-${decision.tone}`} aria-label={needsReview ? `Needs review: ${decision.label}` : decision.label}>
    <Icon aria-hidden="true" />
    {needsReview ? <span className="sr-only">Needs review</span> : null}
    <span aria-hidden={needsReview ? "true" : undefined}>{decision.label}</span>
  </span>;
}

function ProductTable({ rows, selectedLineId, onSelect, compact, ruleLabel }) {
  return (
    <div className={`table-scroll${compact ? " is-compact" : ""}`}>
      <table className="pricing-table">
        <caption className="sr-only">Repricing lines. Select any row to inspect its governed consequence.</caption>
        <colgroup>
          <col className="pricing-col pricing-col--product" />
          <col className="pricing-col pricing-col--scope" />
          <col className="pricing-col pricing-col--price" />
          <col className="pricing-col pricing-col--margin" />
          <col className="pricing-col pricing-col--decision" />
        </colgroup>
        <thead>
          <tr>
            <th className="pricing-head pricing-head--product" scope="col">Product</th>
            <th className="pricing-head pricing-head--scope" scope="col">Scope</th>
            <th className="pricing-head pricing-head--price" scope="col">Price adjustment</th>
            <th className="pricing-head pricing-head--margin" scope="col">Margin and policy</th>
            <th className="pricing-head pricing-head--decision" scope="col">Decision</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const active = selectedLineId === row.id;
            const decision = decisionFor(row);
            const noProposedPrice = row.proposed === "—";
            const noMarginEvaluation = row.proposedMargin === "—";
            const marginGap = Number.isFinite(row.marginGapBasisPoints) ? row.marginGapBasisPoints : null;
            return (
              <tr
                key={row.id}
                data-line-id={row.id}
                className={`${active ? "is-selected " : ""}is-${decision.tone}`.trim()}
                aria-current={active ? "true" : undefined}
                onClick={(event) => {
                  if (event.target.closest("button, a, input, select, textarea")) return;
                  onSelect(row.id);
                }}
              >
                <td data-label="Product">
                  <button
                    className="product-cell"
                    type="button"
                    onClick={() => onSelect(row.id)}
                    aria-label={`Inspect ${row.product}, ${row.variant}`}
                    aria-pressed={active}
                    aria-expanded={active}
                    aria-controls={active ? "repricing-line-inspector" : undefined}
                  >
                    <span className="product-glyph" aria-hidden="true">{row.product.slice(0, 1)}</span>
                    <span><strong>{row.product}</strong><small>{row.variant} · {row.sku}</small></span>
                  </button>
                </td>
                <td className="scope-table-cell" data-label="Scope">
                  <span className="scope-cell" title={row.scope}><Storefront aria-hidden="true" /><span>{row.scope}</span></span>
                </td>
                <td className="price-adjustment-cell" data-label="Price adjustment">
                  <span className={`row-price-movement${noProposedPrice ? " is-unavailable" : ""}`}>
                    <span><strong>{row.current}</strong><small>{row.costState === "stale" ? `Stale cost ${row.cost}` : row.cost === "—" ? "Cost unavailable" : `Cost ${row.cost}`}</small></span>
                    <i><ArrowRight aria-hidden="true" /><small>{noProposedPrice ? "No output" : ruleLabel}</small></i>
                    <span><strong>{row.proposed}</strong><small>{noProposedPrice ? "Not priced" : row.delta}</small></span>
                  </span>
                </td>
                <td className="margin-policy-cell" data-label="Margin and policy">
                  <span className={`row-margin-policy${decision.tone === "review" ? " is-below" : ""}${noMarginEvaluation ? " is-unavailable" : ""}`}>
                    <span className="margin-cell"><strong>{row.margin}</strong><ArrowRight aria-hidden="true" /><strong>{row.proposedMargin}</strong></span>
                    <small><span>{row.floor === "—" ? "Floor not resolved" : `Floor ${row.floor}`}</span><em>{decision.tone === "review" && marginGap != null && marginGap > 0 ? `${(marginGap / 100).toFixed(2)} pp short` : decision.label}</em></small>
                  </span>
                </td>
                <td className="decision-table-cell" data-label="Decision"><span className="row-decision"><Status row={row} /><span className="row-open" aria-hidden="true"><CaretRight className="row-caret" /></span></span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConsequenceLens({ row, ruleLabel, proposalAuthority, onClose, onMove, onRemediate, remediationBusy, remediationError, position, total, lensRef }) {
  const decision = decisionFor(row);
  const DecisionIcon = decision.Icon;
  const issueKind = issueKindFor(row);
  const policyEvidence = policyEvidenceFor(row);
  const policyStatus = ["matched", "no-match", "error", "not-required"].includes(policyEvidence.status)
    ? policyEvidence.status
    : "not-required";
  const policyHeading = policyStatus === "matched"
    ? "Applied margin policy"
    : policyStatus === "error"
      ? "Margin policy evaluation failed"
      : policyStatus === "no-match"
        ? "No margin policy matched"
        : "Margin policy context";
  const policyDisclosureLabel = policyStatus === "matched"
    ? "Why this policy won"
    : policyStatus === "error"
      ? "Why evaluation failed"
      : policyStatus === "no-match"
        ? "Why no policy matched"
        : "Why no evaluation ran";
  const marginGap = Number.isFinite(row.marginGapBasisPoints) ? row.marginGapBasisPoints : null;
  const atFloor = row.classification === "eligible" && marginGap === 0;
  const remediationActions = (row.allowedRemediations ?? []).map(remediationDescriptor).filter(Boolean);
  const issueMessage = row.issue?.message ?? row.raw?.issue?.message ?? row.raw?.policy?.violation?.message ?? null;
  const result = issueKind === "margin-policy"
    ? {
        title: marginGap != null ? `${Math.abs(marginGap / 100).toFixed(2)} pp below floor` : "Margin is below policy",
        detail: row.floorPrice === "—" ? (issueMessage ?? "A compliant price could not be calculated.") : `${row.floorPrice} is the minimum compliant price.`,
      }
    : issueKind === "stale-cost"
      ? { title: "Cost evidence is stale", detail: issueMessage ?? "Refresh cost before the margin result can be trusted." }
      : issueKind === "unsupported-dimension"
        ? { title: "Scope cannot be evaluated", detail: issueMessage ?? "Repair the unsupported channel or location dimension." }
        : issueKind === "excluded"
          ? { title: "Excluded from this Proposal", detail: issueMessage ?? "This line remains visible but outside the selected population." }
          : issueKind === "unpriced"
            ? { title: "Price could not be calculated", detail: issueMessage ?? "Resolve the missing pricing input before selection." }
            : issueKind === "review"
              ? { title: "This line needs review", detail: issueMessage ?? "Resolve the recorded issue before this line can proceed." }
            : atFloor
              ? { title: `Meets the ${row.floor} floor exactly`, detail: "Equality satisfies this margin policy." }
              : { title: row.floor === "—" ? "Policy clear" : `Above the ${row.floor} floor`, detail: "This line can move into the Proposal." };
  const resultTone = row.classification === "eligible"
    ? "clear"
    : issueKind === "margin-policy" || issueKind === "review"
      ? "blocked"
      : issueKind === "stale-cost" || issueKind === "unsupported-dimension" || issueKind === "unpriced"
        ? "warning"
        : "neutral";

  return (
    <aside
      ref={lensRef}
      className={`consequence-lens is-${decision.tone}`}
      id="repricing-line-inspector"
      aria-label={`Decision details for ${row.product}`}
      tabIndex="-1"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); onClose?.(); }
        if (event.target.closest("button, summary, a, input, select, textarea")) return;
        if (event.key === "ArrowUp") { event.preventDefault(); onMove?.(-1); }
        if (event.key === "ArrowDown") { event.preventDefault(); onMove?.(1); }
      }}
    >
      <div className="lens-controls">
        <button type="button" className="lens-back" onClick={onClose} aria-label="Close decision inspector"><CaretRight aria-hidden="true" /><span>Back to lines</span></button>
        <span>Line {position} of {total}</span>
      </div>
      <div className="lens-head">
        <div>
          <p>{decision.eyebrow}</p>
          <h2>{row.product}</h2>
          <span>{row.variant} · {row.sku}</span>
        </div>
        <Status row={row} />
      </div>

      <div className={`lens-price${row.proposed === "—" ? " is-unavailable" : ""}`}>
        <div><span>Current</span><strong>{row.current}</strong><small>{row.margin === "—" ? "Margin unavailable" : `${row.margin} margin`}</small></div>
        <div className="lens-change"><b>{row.proposed === "—" ? "No output" : ruleLabel}</b><i aria-hidden="true" /><small>{row.proposed === "—" ? "Not priced" : row.delta}</small></div>
        <div><span>Proposed</span><strong>{row.proposed}</strong><small>{row.proposedMargin === "—" ? "Margin not evaluated" : `${row.proposedMargin} margin`}</small></div>
      </div>

      <div className={`policy-result is-${resultTone}`}>
        <DecisionIcon aria-hidden="true" />
        <div>
          <small>{issueKind === "margin-policy" || row.classification === "eligible" ? "Margin policy result" : "Decision result"}</small>
          <strong>{result.title}</strong>
          <span>{result.detail}</span>
        </div>
      </div>

      {row.classification === "eligible" ? <div className="eligible-note"><CheckCircle aria-hidden="true" /><span>{row.selected ? "Selected for Proposal" : "Eligible · not selected"}</span></div> : null}
      {remediationActions.length ? <section className="remediation-actions" aria-label="Resolve this preview line">
        <header><span>Resolve in Preview</span><small>Creates a new Preview version only.</small></header>
        <div>{remediationActions.map(({ code, label, Icon, enabled, reason }) => <button
          type="button"
          key={code}
          className={code === "exclude" ? "is-secondary" : "is-primary-resolution"}
          disabled={!enabled || Boolean(remediationBusy)}
          aria-busy={remediationBusy === code}
          aria-label={!enabled && reason ? `${label}: ${reason}` : undefined}
          title={!enabled && reason ? reason : undefined}
          onClick={() => onRemediate(code)}
        ><Icon aria-hidden="true" /><span>{remediationBusy === code ? "Updating…" : label}</span></button>)}</div>
        {remediationError ? <p role="alert"><ShieldWarning aria-hidden="true" />{remediationError}</p> : null}
      </section> : row.classification !== "eligible" ? <div className="remediation-note">
        <LockKey aria-hidden="true" />
        <span><strong>No Preview remediation is available for this session.</strong><small>The line remains unchanged. Proposal review and publication are separate steps.</small></span>
      </div> : null}

      {policyEvidence.name || policyEvidence.code ? <section className={`policy-resolution is-${policyStatus}`} aria-label={policyHeading}>
        <header><span><ShieldCheck aria-hidden="true" /><small>{policyHeading}</small></span><strong>{policyEvidence.name ?? "Margin floor"}</strong></header>
        <dl>
          <div><dt>Code</dt><dd>{policyEvidence.code ?? "—"}</dd></div>
          <div><dt>Version</dt><dd>{policyEvidence.version ?? "—"}</dd></div>
          <div><dt>Scope</dt><dd>{policyEvidence.scope ?? "—"}</dd></div>
        </dl>
        {policyEvidence.explanation || policyEvidence.matchingChain.length ? <details>
          <summary>{policyDisclosureLabel}</summary>
          {policyEvidence.explanation ? <p>{policyEvidence.explanation}</p> : null}
          {policyEvidence.matchingChain.length ? <ol>{policyEvidence.matchingChain.map((entry, index) => <li key={`${matchingChainLabel(entry, index)}-${index}`}>{matchingChainLabel(entry, index)}</li>)}</ol> : null}
        </details> : null}
      </section> : null}

      <div className={`lens-authority${proposalAuthority?.tone ? ` is-${proposalAuthority.tone}` : ""}`}>
        <LockKey aria-hidden="true" />
        <span><strong>{proposalAuthority?.title ?? "Proposal access is unresolved."}</strong><small>{proposalAuthority?.detail ?? "Preview changes do not approve or publish."}</small></span>
      </div>

      <div className="lens-evidence">
        <div><Database aria-hidden="true" /><span><small>Source</small><strong>Supplier baseline · row {row.sourceRow}</strong></span></div>
        <div><FunctionIcon aria-hidden="true" /><span><small>Price adjustment</small><strong>{ruleLabel}</strong></span></div>
        <div><GitBranch aria-hidden="true" /><span><small>Record</small><strong>Catalog version {row.catalogVersion}</strong></span></div>
        <div><Storefront aria-hidden="true" /><span><small>Scope</small><strong>{row.scope}</strong></span></div>
      </div>
    </aside>
  );
}

function ProposalDialog({ onClose, onSubmit, created = null, preview, session, action }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const inertTargets = [...document.querySelectorAll(".side-nav, .workspace-body")];
    document.body.style.overflow = "hidden";
    inertTargets.forEach((target) => target.setAttribute("inert", ""));
    closeRef.current?.focus();

    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
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
      inertTargets.forEach((target) => target.removeAttribute("inert"));
      restoreFocusRef.current?.focus?.();
    };
  }, [onClose]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit();
    } catch (error) {
      setSubmitting(false);
      setSubmitError(toDomainErrorEnvelope(error, "proposal-dialog-submit").error.message);
    }
  };

  const proposalCounts = created?.counts ?? preview.counts;
  const selectedCount = proposalCounts.selected.toLocaleString("en-NG");
  const eligibleCount = proposalCounts.eligible.toLocaleString("en-NG");
  const blockedCount = proposalCounts.blocked.toLocaleString("en-NG");
  const actorName = created?.author.displayName ?? session?.actor.displayName ?? "Resolved session actor";
  const actorRoles = presentRoleCodes(session?.roleCodes);
  const confirmation = action?.confirmation;
  const effectiveAt = created?.effectiveAt ?? preview.effectiveAt;

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="override-dialog" role="dialog" aria-modal="true" aria-labelledby="proposal-dialog-title" aria-describedby="proposal-dialog-boundary" tabIndex="-1">
        <header>
          <div><p>{created ? "Proposal handoff" : "Create Proposal"}</p><h2 id="proposal-dialog-title">{created ? "The governed object is preserved for review." : (confirmation?.title ?? "Carry this exact preview into governance.")}</h2></div>
          <button ref={closeRef} type="button" className="icon-control" onClick={onClose} aria-label="Close Proposal confirmation"><X aria-hidden="true" /></button>
        </header>
        <div className="dialog-consequence">
          <div><span>Selected scope</span><strong>{selectedCount} lines</strong><small>{eligibleCount} eligible</small></div>
          <ArrowRight aria-hidden="true" />
          <div><span>Resulting state</span><strong>Blocked</strong><small>{blockedCount} issues preserved</small></div>
        </div>
        <form onSubmit={submit}>
          <div className="proposal-transfer">
            <div><Database aria-hidden="true" /><span><small>Population</small><strong>All {selectedCount} selected lines transfer</strong><em>No row is silently removed</em></span></div>
            <div><ShieldWarning aria-hidden="true" /><span><small>Open decisions</small><strong>{blockedCount} issues keep the Proposal blocked</strong><em>Policy, source and dimension evidence remains attached</em></span></div>
            <div><ClockCounterClockwise aria-hidden="true" /><span><small>Effective</small><strong>{formatEffectiveAt(effectiveAt, session?.organisation.timezone)}</strong><em>Approval and publish remain separate</em></span></div>
          </div>
          <div className="reviewer-record">
            <span className="avatar">{initials(actorName)}</span>
            <span><small>Proposal author</small><strong>{actorName}</strong><em>{actorRoles.join(" · ")} · current session identity</em></span>
            <GitBranch aria-hidden="true" />
          </div>
          <div className="dialog-boundary" id="proposal-dialog-boundary"><Info aria-hidden="true" /><span>{confirmation?.body ?? "Creating the Proposal does not approve an exception or publish a price."}</span></div>
          {submitError ? <div className="dialog-error" role="alert"><ShieldWarning aria-hidden="true" /><span>{submitError}</span></div> : null}
          <footer><button className="secondary-action" type="button" onClick={onClose}>{created ? "Close" : "Cancel"}</button>{!created ? <button className="primary-action" type="submit" disabled={submitting}><span>{submitting ? "Creating Proposal…" : (confirmation?.confirmLabel ?? "Create Proposal")}</span><ArrowRight aria-hidden="true" /></button> : null}</footer>
        </form>
      </section>
    </div>
  );
}

function WorkspaceLoadState({ state, error, onRetry }) {
  const failed = state === "error";
  return <section className={`workspace-load-state${failed ? " is-error" : ""}`} role={failed ? "alert" : "status"} aria-live="polite">
    <span className="workspace-load-state__mark">{failed ? <ShieldWarning aria-hidden="true" /> : <Database aria-hidden="true" />}</span>
    <p>{failed ? "Workspace data unavailable" : "Resolving workspace context"}</p>
    <h1>{failed ? "This workspace view could not be loaded." : "Preparing the governed preview."}</h1>
    <span>{failed ? error?.error.message : "Identity, population accounting and allowed actions are resolving from the fixture adapter."}</span>
    {failed && onRetry ? <button type="button" className="primary-action" onClick={onRetry}>Retry workspace</button> : !failed ? <i aria-hidden="true" /> : null}
  </section>;
}

function WorkspaceApplication({ repositories, runtimeConfig, navigateExternal }) {
  const [route, setRoute] = useState(() => parseWorkspaceHash());
  const siteHref = runtimeConfig.marketingUrl;
  const [session, setSession] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [loadError, setLoadError] = useState(null);
  const [lineLoadState, setLineLoadState] = useState("ready");
  const [lineLoadError, setLineLoadError] = useState(null);
  const [lineRetryToken, setLineRetryToken] = useState(0);
  const [linePageIndex, setLinePageIndex] = useState(0);
  const [lineCursorHistory, setLineCursorHistory] = useState([null]);
  const [linePageBusy, setLinePageBusy] = useState(false);
  const [remediationBusy, setRemediationBusy] = useState(null);
  const [remediationError, setRemediationError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("480f12f1-c0fa-528e-b3d0-27e340e93046");
  const [compact, setCompact] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [proposalCreated, setProposalCreated] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [governedPreview, setGovernedPreview] = useState(null);
  const [publication, setPublication] = useState(null);
  const [audit, setAudit] = useState(null);
  const [governedLoadState, setGovernedLoadState] = useState("idle");
  const [governedLoadError, setGovernedLoadError] = useState(null);
  const [governedBusy, setGovernedBusy] = useState(false);
  const [governedError, setGovernedError] = useState(null);
  const [evidenceActors, setEvidenceActors] = useState([]);
  const [notice, setNotice] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [channelFilter, setChannelFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [openPanel, setOpenPanel] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => globalThis.localStorage?.getItem("owomide:workspace-nav") === "collapsed");
  const [inspectorOpen, setInspectorOpen] = useState(() => Boolean(parseWorkspaceHash().lineId));
  const [inspectorOwnsSurface, setInspectorOwnsSurface] = useState(() => globalThis.window?.matchMedia?.("(max-width: 1799px)").matches ?? false);
  const [viewTabOverflow, setViewTabOverflow] = useState({ before: false, after: false });
  const [inspectorReturnFocusLineId, setInspectorReturnFocusLineId] = useState(null);
  const workSurfaceRef = useRef(null);
  const viewTabsRef = useRef(null);
  const inspectorOriginRef = useRef(null);
  const inspectorRef = useRef(null);
  const inspectorHandoffRef = useRef(0);
  const inspectorMoveFocusRef = useRef(false);
  const currentFilterKeyRef = useRef(null);
  const linePageRequestRef = useRef(0);
  const linePageRetryRef = useRef(null);
  const activeLineFiltersRef = useRef({ status: "all", query: "", channelId: "all", locationId: "all" });
  const governedRequestSequenceRef = useRef(0);
  const previewRouteId = route.surface === "repricing" ? route.resourceId ?? "FX-004" : null;
  const previewRouteVersion = route.surface === "repricing" ? route.resourceVersion ?? null : null;
  activeLineFiltersRef.current = { status: statusFilter, query: debouncedQuery, channelId: channelFilter, locationId: locationFilter };

  const goToRoute = useCallback((nextRoute, { replace = false } = {}) => {
    const nextHash = workspaceHash(nextRoute);
    window.history[replace ? "replaceState" : "pushState"](null, "", nextHash);
    setRoute(parseWorkspaceHash(nextHash));
  }, []);

  const signOut = useCallback(async () => {
    setOpenPanel(null);
    try {
      await repositories.identity.signOut?.();
    } finally {
      if (runtimeConfig.logoutUrl) {
        navigateExternal(runtimeConfig.logoutUrl);
        return;
      }
      setSession(null);
      setLoadState("loading");
      goToRoute({ surface: "login", returnTo: "/work", view: "default" }, { replace: true });
    }
  }, [goToRoute, navigateExternal, repositories, runtimeConfig.logoutUrl]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      globalThis.localStorage?.setItem("owomide:workspace-nav", next ? "collapsed" : "expanded");
      return next;
    });
  }, []);

  useEffect(() => {
    if (!window.location.hash || window.location.hash === "#top") {
      goToRoute({ surface: "login", returnTo: "/work", view: "default" }, { replace: true });
    }
    const resolveRoute = () => setRoute(parseWorkspaceHash());
    window.addEventListener("popstate", resolveRoute);
    window.addEventListener("hashchange", resolveRoute);
    return () => {
      window.removeEventListener("popstate", resolveRoute);
      window.removeEventListener("hashchange", resolveRoute);
    };
  }, [goToRoute]);

  const loadWorkspace = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const currentRoute = parseWorkspaceHash();
      const routePreviewRequest = previewRouteId
        ? previewRequestForRoute({ surface: "repricing", resourceId: previewRouteId, resourceVersion: previewRouteVersion, lineId: currentRoute.surface === "repricing" ? currentRoute.lineId : null })
        : null;
      const activeFilters = activeLineFiltersRef.current;
      const previewRequest = routePreviewRequest
        ? {
            ...routePreviewRequest,
            classification: classificationForView(activeFilters.status),
            query: activeFilters.query,
            channelId: activeFilters.channelId === "all" ? undefined : activeFilters.channelId,
            locationId: activeFilters.locationId === "all" ? undefined : activeFilters.locationId,
          }
        : null;
      const [resolvedSession, resolvedPreview, resolvedEvidenceActors] = await Promise.all([
        repositories.identity.getSession(),
        previewRequest
          ? repositories.repricing.getPreview(previewRequest)
          : Promise.resolve(null),
        repositories.identity.listDesignEvidenceActors
          ? repositories.identity.listDesignEvidenceActors().catch(() => [])
          : Promise.resolve([]),
      ]);
      setSession(resolvedSession);
      setPreview(resolvedPreview);
      setEvidenceActors(resolvedEvidenceActors);
      setLinePageIndex(0);
      setLineCursorHistory([null]);
      const appliedFilters = resolvedPreview?.filterResult?.applied;
      currentFilterKeyRef.current = resolvedPreview
        ? filterRequestKey({
            ref: resolvedPreview.ref,
            classification: appliedFilters?.classification ?? previewRequest?.classification ?? "all",
            query: appliedFilters?.query ?? previewRequest?.query ?? "",
            channelId: appliedFilters?.channelId ?? previewRequest?.channelId ?? "all",
            locationId: appliedFilters?.locationId ?? previewRequest?.locationId ?? "all",
          })
        : null;
      setLineLoadState("ready");
      setLineLoadError(null);
      setSelectedLineId((current) => resolvedPreview?.lines.some((line) => line.id === current) ? current : resolvedPreview?.lines[0]?.id ?? "");
      setLoadState("ready");
    } catch (error) {
      setLoadError(toDomainErrorEnvelope(error, "workspace-preview-load"));
      setLoadState("error");
    }
  }, [previewRouteId, previewRouteVersion, repositories]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const loadProposalEvidence = useCallback(async (nextProposal) => {
    const expectedRef = nextProposal?.sourcePreviewRef;
    if (!expectedRef?.id || !expectedRef.version) {
      throw sourceEvidenceError("This Proposal does not identify an exact source Preview version.", { proposalId: nextProposal?.ref?.id ?? null });
    }
    const sourcePreview = await repositories.repricing.getPreview({ ref: expectedRef, limit: REPRICING_PAGE_LIMIT });
    if (sourcePreview.ref.id !== expectedRef.id || sourcePreview.ref.version !== expectedRef.version) {
      throw sourceEvidenceError("The resolved Preview does not match this Proposal's locked source evidence.", {
        expectedId: expectedRef.id,
        expectedVersion: expectedRef.version,
        resolvedId: sourcePreview.ref.id,
        resolvedVersion: sourcePreview.ref.version,
      });
    }
    return sourcePreview;
  }, [repositories]);

  const loadGovernedContext = useCallback(async ({ protectedSurface, protectedView, expectedProposalId, expectedProposalVersion, expectedOperationId, expectedOperationVersion, expectedOverrideId, expectedOverrideVersion, resolvedSession } = {}) => {
    const requestSequence = governedRequestSequenceRef.current + 1;
    governedRequestSequenceRef.current = requestSequence;
    setGovernedLoadState("loading");
    setGovernedLoadError(null);
    setGovernedPreview(null);
    try {
      const routeError = protectedRouteVersionError({
        surface: protectedSurface,
        resourceId: expectedProposalId,
        resourceVersion: expectedProposalVersion,
        operationId: expectedOperationId,
        operationVersion: expectedOperationVersion,
        overrideId: expectedOverrideId,
        overrideVersion: expectedOverrideVersion,
        view: protectedView,
      });
      if (routeError) throw new RepositoryError(routeError);
      const nextSession = resolvedSession ?? await repositories.identity.getSession();
      const requestedProposalRef = expectedProposalId && expectedProposalVersion
        ? { kind: "resource", id: expectedProposalId, version: expectedProposalVersion }
        : undefined;
      const nextProposal = await repositories.proposals.getDetail(requestedProposalRef ? { ref: requestedProposalRef } : undefined);
      if (expectedProposalId && expectedProposalId !== nextProposal.ref.id) {
        const missing = new Error("The requested Proposal is not available in this workspace.");
        missing.code = "PROPOSAL_NOT_FOUND";
        throw missing;
      }
      if (protectedSurface === "proposal-override") {
        if (!nextProposal.override || expectedOverrideId !== nextProposal.override.ref.id) {
          const missing = new Error("The requested exception is not available for this Proposal.");
          missing.code = "OVERRIDE_NOT_FOUND";
          throw missing;
        }
        if (expectedOverrideVersion !== nextProposal.override.ref.version) {
          throw new RepositoryError(createDomainErrorEnvelope({
            code: "OVERRIDE_STALE_VERSION",
            message: "This exception changed after the protected review link was opened.",
            details: { expectedVersion: expectedOverrideVersion, currentVersion: nextProposal.override.ref.version },
            retryable: false,
            domain: "governance-route",
            traceId: "workspace-override-stale-version",
          }));
        }
      }
      if (protectedSurface === "proposal-approval" && nextProposal.override?.state === "pending") {
        throw new RepositoryError(createDomainErrorEnvelope({
          code: "OVERRIDE_VERSION_REQUIRED",
          message: "Open the version-bound exception review link before deciding this pending request.",
          details: { proposalRef: nextProposal.ref, overrideRef: nextProposal.override.ref },
          retryable: false,
          domain: "governance-route",
          traceId: "workspace-override-version-required",
        }));
      }
      const nextGovernedPreview = await loadProposalEvidence(nextProposal);

      let nextPublication = null;
      if (nextProposal.publicationRef && (nextSession.effectiveCapabilities.includes("publish:execute") || nextSession.effectiveCapabilities.includes("audit:read"))) {
        const requestedOperationRef = expectedOperationId && expectedOperationVersion
          ? { kind: "resource", id: expectedOperationId, version: expectedOperationVersion }
          : nextProposal.publicationRef;
        if (expectedOperationId && expectedOperationId !== nextProposal.publicationRef.id) throw new Error("The requested publication operation is not available for this Proposal.");
        nextPublication = await repositories.publishing.get({ operationRef: requestedOperationRef });
      }

      let nextAudit = null;
      if (nextSession.effectiveCapabilities.includes("audit:read")) {
        nextAudit = await repositories.audit.getProposalHistory({ proposalId: nextProposal.ref.id });
      }

      if (requestSequence !== governedRequestSequenceRef.current) return null;
      setSession(nextSession);
      setProposal(nextProposal);
      setGovernedPreview(nextGovernedPreview);
      setProposalCreated((current) => current || { ref: nextProposal.ref, title: nextProposal.title, counts: nextProposal.counts, author: nextProposal.author, effectiveAt: nextProposal.effectiveAt });
      setPublication(nextPublication);
      setAudit(nextAudit);
      setGovernedLoadState("ready");
      return { proposal: nextProposal, preview: nextGovernedPreview, publication: nextPublication, audit: nextAudit };
    } catch (error) {
      if (requestSequence !== governedRequestSequenceRef.current) return null;
      setGovernedLoadError(toDomainErrorEnvelope(error, "proposal-context-load"));
      setGovernedLoadState("error");
      return null;
    }
  }, [loadProposalEvidence, repositories]);

  useEffect(() => {
    if (loadState !== "ready" || !GOVERNED_SURFACES.has(route.surface)) return;
    loadGovernedContext({
      protectedSurface: route.surface,
      protectedView: route.view,
      expectedProposalId: route.resourceId,
      expectedProposalVersion: route.resourceVersion,
      expectedOperationId: route.operationId,
      expectedOperationVersion: route.operationVersion,
      expectedOverrideId: route.overrideId,
      expectedOverrideVersion: route.overrideVersion,
      resolvedSession: session,
    });
  }, [loadGovernedContext, loadState, route.operationId, route.operationVersion, route.overrideId, route.overrideVersion, route.resourceId, route.resourceVersion, route.surface, session?.actor.id]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 260);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (loadState !== "ready" || !preview?.ref) return undefined;
    const request = {
      ref: preview.ref,
      classification: classificationForView(statusFilter),
      query: debouncedQuery,
      channelId: channelFilter === "all" ? undefined : channelFilter,
      locationId: locationFilter === "all" ? undefined : locationFilter,
      limit: route.lineId && inspectorOpen ? 200 : REPRICING_PAGE_LIMIT,
    };
    const requestKey = filterRequestKey({
      ref: request.ref,
      classification: request.classification,
      query: request.query,
      channelId: request.channelId ?? "all",
      locationId: request.locationId ?? "all",
    });
    const needsExactRouteLine = Boolean(route.lineId && inspectorOpen && !preview.lines.some((line) => line.id === route.lineId));
    if (currentFilterKeyRef.current === requestKey && lineRetryToken === 0 && !needsExactRouteLine) return undefined;

    let current = true;
    if (currentFilterKeyRef.current !== requestKey) {
      linePageRequestRef.current += 1;
      setLinePageBusy(false);
      setLinePageIndex(0);
      setLineCursorHistory([null]);
      linePageRetryRef.current = null;
    }
    setLineLoadState("loading");
    setLineLoadError(null);
    repositories.repricing.getPreview(request).then((nextPreview) => {
      if (!current) return;
      currentFilterKeyRef.current = requestKey;
      setPreview(nextPreview);
      setSelectedLineId((selected) => nextPreview.lines.some((line) => line.id === selected) ? selected : nextPreview.lines[0]?.id ?? "");
      setLineLoadState("ready");
      setLineLoadError(null);
    }).catch((error) => {
      if (!current) return;
      setLineLoadError(toDomainErrorEnvelope(error, "repricing-lines-filter"));
      setLineLoadState("error");
    });
    return () => { current = false; };
  }, [channelFilter, debouncedQuery, inspectorOpen, lineRetryToken, loadState, locationFilter, preview?.ref?.id, preview?.ref?.version, repositories, route.lineId, statusFilter]);

  const rows = useMemo(() => (preview?.lines ?? []).map((line) => presentPreviewLine(line, session?.organisation.locale ?? "en-NG")), [preview, session?.organisation.locale]);
  const filteredRows = rows;
  const channelOptions = preview?.facets?.channels ?? [];
  const locationOptions = preview?.facets?.locations ?? [];

  const activeFilterCount = Number(channelFilter !== "all") + Number(locationFilter !== "all");

  const selectedRow = rows.find((row) => row.id === selectedLineId) ?? rows[0] ?? null;
  const createProposalAction = findAllowedAction(preview?.allowedActions ?? [], "proposal.create");
  const readProposalAction = findAllowedAction(preview?.allowedActions ?? [], "proposal.read");
  const serverProposalTarget = readProposalAction?.enabled && readProposalAction.targetRef?.id && readProposalAction.targetRef?.version
    ? readProposalAction.targetRef
    : null;
  const existingProposalRef = proposalCreated?.ref
    ?? (createProposalAction?.enabled === false ? serverProposalTarget : null);
  const currentProposalAction = existingProposalRef ? readProposalAction : createProposalAction;
  const proposalActionReason = typeof currentProposalAction?.reason === "string"
    ? currentProposalAction.reason
    : currentProposalAction?.reason?.message;
  const proposalActorName = shortActorName(session?.actor.displayName ?? "This user");
  const proposalAuthority = existingProposalRef && currentProposalAction?.enabled
    ? {
        tone: "granted",
        title: `${proposalActorName} can open this Proposal.`,
        detail: `Open the existing ${preview?.counts.blocked ? "blocked " : ""}Proposal. Continue without creating a duplicate. Approval and publication remain separate.`,
      }
    : !existingProposalRef && currentProposalAction?.enabled
      ? {
          tone: "granted",
          title: `${proposalActorName} can create a Proposal from this Preview.`,
          detail: "Creation preserves this Preview version; it does not approve or publish it.",
        }
      : currentProposalAction?.enabled === false
        ? {
            tone: "blocked",
            title: "Proposal handoff is blocked.",
            detail: proposalActionReason ?? "The server did not enable a Proposal action for this Preview.",
          }
        : {
            tone: "unresolved",
            title: "Proposal access is unresolved.",
            detail: "No server-authorised Proposal action is available for this Preview.",
          };
  const proposalActionHelper = currentProposalAction?.enabled === false
    ? (proposalActionReason ?? "This Proposal action is unavailable for the current Preview.")
    : existingProposalRef
      ? `Existing Proposal retains ${preview?.counts.blocked.toLocaleString("en-NG")} lines for review.`
      : `Creates a governed Proposal with ${preview?.counts.blocked.toLocaleString("en-NG")} lines held for review.`;
  const ruleLabel = preview ? repricingRuleLabel(preview.rule, session?.organisation.locale ?? "en-NG") : "Rule resolving";

  useEffect(() => {
    if (loadState !== "ready" || !filteredRows.length) return;
    if (!filteredRows.some((row) => row.id === selectedLineId)) setSelectedLineId(filteredRows[0].id);
  }, [filteredRows, loadState, selectedLineId]);

  useEffect(() => {
    if (route.surface !== "repricing" || !route.lineId || !inspectorOpen || lineLoadState !== "ready") return;
    if (!selectedLineId || route.lineId === selectedLineId || !filteredRows.some((row) => row.id === selectedLineId)) return;
    goToRoute({
      surface: "repricing",
      resourceId: preview?.ref?.id ?? route.resourceId ?? "FX-004",
      resourceVersion: preview?.ref?.version ?? route.resourceVersion,
      view: "preview",
      lineId: selectedLineId,
    }, { replace: true });
  }, [filteredRows, goToRoute, inspectorOpen, lineLoadState, preview?.ref?.id, preview?.ref?.version, route.lineId, route.resourceId, route.resourceVersion, route.surface, selectedLineId]);

  useEffect(() => {
    setRemediationError(null);
  }, [preview?.ref?.version, selectedLineId]);

  useEffect(() => {
    if (!notice) return undefined;
    const id = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (route.surface === "repricing") {
          event.preventDefault();
          document.getElementById("line-search")?.focus();
        } else if (SEARCHABLE_OPERATIONAL_SURFACES.has(route.surface)) {
          const input = document.querySelector(".ops-search input");
          if (input) {
            event.preventDefault();
            input.focus();
          }
        } else if (GOVERNED_SURFACES.has(route.surface) && (proposal?.ref.id ?? route.resourceId)) {
          event.preventDefault();
          goToRoute({ surface: "proposal", resourceId: proposal?.ref.id ?? route.resourceId, resourceVersion: proposal?.ref.version ?? route.resourceVersion, view: "lines" });
        }
      }
      if (event.key === "Escape" && openPanel) setOpenPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goToRoute, openPanel, proposal?.ref.id, proposal?.ref.version, route.resourceId, route.resourceVersion, route.surface]);

  useEffect(() => {
    if (route.surface !== "repricing") return;
    if (route.lineId) {
      setSelectedLineId(route.lineId);
      setInspectorOpen(true);
    }
  }, [route.lineId, route.surface]);

  useLayoutEffect(() => {
    if (!inspectorMoveFocusRef.current || !inspectorOpen || !selectedRow) return;
    inspectorRef.current?.focus({ preventScroll: true });
    inspectorMoveFocusRef.current = false;
  }, [inspectorOpen, selectedRow]);

  useLayoutEffect(() => {
    if (route.surface !== "repricing" || loadState !== "ready") return undefined;
    const surface = workSurfaceRef.current;
    if (!surface) return undefined;
    const update = () => {
      const width = surface.getBoundingClientRect().width;
      const fallback = globalThis.window?.matchMedia?.("(max-width: 1799px)").matches ?? false;
      setInspectorOwnsSurface(width > 0 ? width < INSPECTOR_DOCK_MIN_SURFACE : fallback);
    };
    update();
    const observer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(update) : null;
    observer?.observe(surface);
    globalThis.window?.addEventListener?.("resize", update);
    return () => {
      observer?.disconnect();
      globalThis.window?.removeEventListener?.("resize", update);
    };
  }, [loadState, preview?.ref?.id, route.surface, sidebarCollapsed]);

  useEffect(() => {
    if (route.surface !== "repricing" || loadState !== "ready") return undefined;
    const rail = viewTabsRef.current;
    const active = rail?.querySelector('[aria-selected="true"]');
    if (!rail || !active) return undefined;

    let frame = null;
    const updateOverflow = () => {
      const before = rail.scrollLeft > 2;
      const after = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2;
      setViewTabOverflow((current) => current.before === before && current.after === after ? current : { before, after });
    };

    rail.addEventListener("scroll", updateOverflow, { passive: true });
    globalThis.window?.addEventListener?.("resize", updateOverflow);
    const observer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(updateOverflow) : null;
    observer?.observe(rail);
    updateOverflow();

    if (rail.scrollWidth > rail.clientWidth) {
      const reduced = globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      active.scrollIntoView({ block: "nearest", inline: "center", behavior: reduced ? "auto" : "smooth" });
      frame = globalThis.window?.requestAnimationFrame?.(updateOverflow) ?? null;
    }

    return () => {
      if (frame != null) globalThis.window?.cancelAnimationFrame?.(frame);
      observer?.disconnect();
      rail.removeEventListener("scroll", updateOverflow);
      globalThis.window?.removeEventListener?.("resize", updateOverflow);
    };
  }, [loadState, preview?.counts?.blocked, preview?.counts?.eligible, preview?.counts?.excluded, preview?.counts?.total, preview?.counts?.unpriced, route.surface, statusFilter]);

  useEffect(() => {
    const lineId = inspectorReturnFocusLineId;
    if (!lineId || inspectorOpen || route.lineId || loadState !== "ready" || lineLoadState !== "ready") return undefined;
    const frame = window.requestAnimationFrame(() => {
      const liveOrigin = document.querySelector(`[data-line-id="${lineId}"] .product-cell`);
      if (!liveOrigin?.isConnected) return;
      liveOrigin.focus();
      inspectorOriginRef.current = liveOrigin;
      setInspectorReturnFocusLineId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filteredRows, inspectorOpen, inspectorReturnFocusLineId, lineLoadState, loadState, route.lineId]);

  useEffect(() => {
    if (route.surface !== "repricing" || !inspectorOpen || !selectedRow) return undefined;
    const compactHandoff = window.matchMedia("(max-width: 1279px)").matches;
    if (!compactHandoff && !inspectorMoveFocusRef.current) return undefined;

    const handoff = ++inspectorHandoffRef.current;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (handoff !== inspectorHandoffRef.current) return;
        const lens = inspectorRef.current;
        if (!lens) return;
        lens.focus({ preventScroll: true });
        inspectorMoveFocusRef.current = false;
        if (!compactHandoff) return;
        const top = Math.max(0, lens.getBoundingClientRect().top + window.scrollY - 72);
        window.scrollTo({
          top,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      });
    });

    return () => {
      inspectorHandoffRef.current += 1;
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [inspectorOpen, route.lineId, route.surface, selectedRow]);

  const selectEvidenceActor = useCallback(async (actorId) => {
    if (!repositories.identity.selectDesignEvidenceActor) return;
    setOpenPanel(null);
    setGovernedError(null);
    try {
      const nextSession = await repositories.identity.selectDesignEvidenceActor(actorId);
      if (route.surface === "repricing") {
        const visibleLimit = Math.max(preview?.lines?.length ?? 0, preview?.page?.limit ?? REPRICING_PAGE_LIMIT);
        const nextPreview = await repositories.repricing.getPreview({
          ref: preview?.ref,
          classification: classificationForView(statusFilter),
          query: debouncedQuery,
          channelId: channelFilter === "all" ? undefined : channelFilter,
          locationId: locationFilter === "all" ? undefined : locationFilter,
          limit: visibleLimit,
        });
        setSession(nextSession);
        setPreview(nextPreview);
        setLinePageIndex(0);
        setLineCursorHistory([null]);
        setSelectedLineId((selected) => nextPreview.lines.some((line) => line.id === selected) ? selected : nextPreview.lines[0]?.id ?? "");
      } else if (OPERATIONAL_SURFACES.has(route.surface)) {
        // OperationalWorkspace is keyed by the resolved actor below, so the
        // current route remounts and refetches through the new capability set.
        setSession(nextSession);
      } else {
        setSession(nextSession);
        const cannotReadPublication = route.surface === "publication"
          && !nextSession.effectiveCapabilities.includes("publish:execute")
          && !nextSession.effectiveCapabilities.includes("audit:read");
        if (cannotReadPublication) {
          goToRoute({ surface: "proposal", resourceId: proposal?.ref.id ?? route.resourceId, resourceVersion: proposal?.ref.version ?? route.resourceVersion, view: "overview" });
        }
        await loadGovernedContext({
          protectedSurface: route.surface,
          expectedProposalId: proposal?.ref.id ?? route.resourceId,
          expectedProposalVersion: route.resourceVersion,
          expectedOperationId: route.operationId,
          expectedOperationVersion: route.operationVersion,
          expectedOverrideId: route.overrideId,
          expectedOverrideVersion: route.overrideVersion,
          resolvedSession: nextSession,
        });
      }
    } catch (error) {
      const envelope = toDomainErrorEnvelope(error, "fixture-evidence-session");
      setNotice({ title: "Session evidence could not resolve", detail: envelope.error.message, kind: "info" });
    }
  }, [channelFilter, debouncedQuery, goToRoute, loadGovernedContext, locationFilter, preview, proposal?.ref.id, repositories, route.operationId, route.operationVersion, route.overrideId, route.overrideVersion, route.resourceId, route.resourceVersion, route.surface, statusFilter]);

  const navigate = async (label) => {
    setOpenPanel(null);
    if (label === "Work queue") {
      goToRoute({ surface: "work", view: "needs-me" });
      return;
    }
    if (label === "Catalog") {
      goToRoute({ surface: "catalog", view: "list" });
      return;
    }
    if (label === "Imports") {
      goToRoute({ surface: "imports", view: "ledger" });
      return;
    }
    if (label === "Repricing") {
      goToRoute({ surface: "repricing", resourceId: "FX-004", view: "preview" });
      return;
    }
    if (label === "Proposals") {
      goToRoute({ surface: "proposals", view: "needs-me" });
      return;
    }
    if (label === "Margin policies") {
      goToRoute({ surface: "rules", view: "read" });
      return;
    }
    if (label === "Audit") {
      goToRoute({ surface: "audit", view: "history" });
      return;
    }
    if (label === "Workspace details") {
      const organisation = shortOrganisationName(session?.organisation.name ?? "Current workspace");
      setNotice({ title: organisation, detail: `${session?.organisation.baseCurrency ?? "Currency resolving"} · ${session?.organisation.timezone ?? "Timezone resolving"} · Fictional data · No live writes.`, kind: "info" });
      return;
    }
    goToRoute({ surface: "work", view: "needs-me" });
  };

  const createProposal = useCallback(async () => {
    if (!preview || !createProposalAction?.enabled) {
      throw new Error(createProposalAction?.reason?.message ?? "Proposal creation is not available for this preview.");
    }
    try {
      const result = await repositories.proposals.createFromPreview({
        sourcePreviewRef: preview.ref,
        idempotencyKey: `rpr03:${preview.ref.id}:${preview.ref.version}:proposal`,
        title: preview.title,
      });
      setProposalCreated(result.data);
      const detail = await repositories.proposals.getDetail({ ref: result.data.ref });
      setProposal(detail);
      setGovernedPreview(null);
      setPublication(null);
      setAudit(null);
      setGovernedLoadState("ready");
      setDialogOpen(false);
      setNotice({ title: "Proposal created", detail: `The exact preview snapshot transferred with all ${result.data.counts.blocked.toLocaleString("en-NG")} unresolved issues preserved.`, kind: "success" });
      goToRoute({ surface: "proposal", resourceId: detail.ref.id, resourceVersion: detail.ref.version, view: "overview" });
      return result;
    } catch (error) {
      const envelope = toDomainErrorEnvelope(error, "proposal-create");
      setNotice({ title: "Proposal was not created", detail: envelope.error.message, kind: "info" });
      throw error;
    }
  }, [createProposalAction, goToRoute, preview, repositories]);

  const performLineRemediation = useCallback(async (action) => {
    if (!preview?.ref || !selectedLineId || remediationBusy) return false;
    if (typeof repositories.repricing.remediateLine !== "function") {
      setRemediationError("Preview remediation is not available from this repository.");
      return false;
    }

    setRemediationBusy(action);
    setRemediationError(null);
    try {
      const result = await repositories.repricing.remediateLine({
        previewRef: preview.ref,
        lineId: selectedLineId,
        action,
        idempotencyKey: `preview-remediation:${preview.ref.id}:v${preview.ref.version}:${selectedLineId}:${action}`,
      });
      const nextPreview = result?.data ?? result;
      if (!nextPreview?.ref?.id || !nextPreview.ref.version || !Array.isArray(nextPreview.lines)) {
        throw new Error("The remediation completed without a versioned Preview response.");
      }

      const updatedLine = nextPreview.lines.find((line) => line.id === selectedLineId);
      const nextView = updatedLine?.classification === "blocked"
        ? "review"
        : REPRICING_VIEWS.includes(updatedLine?.classification)
          ? updatedLine.classification
          : "all";
      setPreview(nextPreview);
      setLinePageIndex(0);
      setLineCursorHistory([null]);
      setStatusFilter(nextView);
      setProposalCreated(false);
      if (!updatedLine) {
        setInspectorOpen(false);
        setSelectedLineId(nextPreview.lines[0]?.id ?? "");
      }
      currentFilterKeyRef.current = null;
      setLineLoadState("ready");
      setLineLoadError(null);
      setNotice({
        title: "Preview updated",
        detail: `${action === "apply-floor" ? "Floor price applied" : action === "exclude" ? "Line excluded" : action === "refresh-cost" ? "Cost refreshed" : "Dimension repaired"}. Preview ${nextPreview.ref.version} is now current; no approval or publication occurred.${updatedLine ? "" : " The updated line is outside this returned page."}`,
        kind: "success",
      });
      goToRoute({
        surface: "repricing",
        resourceId: nextPreview.ref.id,
        resourceVersion: nextPreview.ref.version,
        view: "preview",
        ...(updatedLine ? { lineId: selectedLineId } : {}),
      });
      return true;
    } catch (error) {
      const envelope = toDomainErrorEnvelope(error, `repricing-remediation-${action}`);
      setRemediationError(envelope.error.message);
      return false;
    } finally {
      setRemediationBusy(null);
    }
  }, [goToRoute, preview, remediationBusy, repositories, selectedLineId]);

  const performProposalAction = useCallback(async (code, input = {}) => {
    if (!proposal) return false;
    setGovernedBusy(true);
    setGovernedError(null);
    try {
      if (code === "override.request") {
        const result = await repositories.proposals.requestOverride({
          proposalRef: proposal.ref,
          idempotencyKey: `override:${proposal.ref.id}:v${proposal.ref.version}`,
          reason: input.reason,
          evidence: input.evidence,
        });
        setProposal(result.data.proposal);
        goToRoute({ surface: "proposal", resourceId: result.data.proposal.ref.id, resourceVersion: result.data.proposal.ref.version, view: "overview" });
      } else if (code === "override.approve" || code === "override.deny") {
        const branchAction = findAllowedAction(proposal.override?.allowedActions ?? [], code) ?? findAllowedAction(proposal.allowedActions, code);
        if (!branchAction?.enabled || !["approve", "deny"].includes(branchAction.decision)) {
          throw new Error(branchAction?.reason?.message ?? "This exception decision is not available for the current version.");
        }
        const result = await repositories.proposals.decideOverride({
          overrideRef: proposal.override.ref,
          decision: branchAction.decision,
          idempotencyKey: `override-decision:${branchAction.decision}:${proposal.override.ref.id}:v${proposal.override.ref.version}`,
        });
        setProposal(result.data.proposal);
        goToRoute({ surface: "proposal", resourceId: result.data.proposal.ref.id, resourceVersion: result.data.proposal.ref.version, view: "overview" });
      } else if (code === "proposal.submit") {
        const result = await repositories.proposals.submit({ proposalRef: proposal.ref, idempotencyKey: `submit:${proposal.ref.id}:v${proposal.ref.version}` });
        setProposal(result.data);
        goToRoute({ surface: "proposal", resourceId: result.data.ref.id, resourceVersion: result.data.ref.version, view: "overview" });
      } else if (code === "proposal.approve") {
        const result = await repositories.proposals.approve({ proposalRef: proposal.ref, idempotencyKey: `approve:${proposal.ref.id}:v${proposal.ref.version}` });
        setProposal(result.data);
        goToRoute({ surface: "proposal", resourceId: result.data.ref.id, resourceVersion: result.data.ref.version, view: "overview" });
      } else if (code === "publication.start") {
        const result = await repositories.publishing.start({ proposalRef: proposal.ref, idempotencyKey: `publish:${proposal.ref.id}:v${proposal.ref.version}` });
        const nextProposal = await repositories.proposals.getDetail({ ref: result.data.proposalRef });
        setProposal(nextProposal);
        setPublication(result.data);
        goToRoute({ surface: "publication", resourceId: nextProposal.ref.id, resourceVersion: nextProposal.ref.version, operationId: result.data.ref.id, operationVersion: result.data.ref.version, view: "status" });
      } else if (code === "publication.reconcile") {
        const nextPublication = await repositories.publishing.reconcile({ operationRef: publication.ref });
        setPublication(nextPublication);
        goToRoute({ surface: "publication", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, operationId: nextPublication.ref.id, operationVersion: nextPublication.ref.version, view: "status" }, { replace: true });
      } else if (code === "publication.retry_remaining" || code === "publication.retry") {
        const result = await repositories.publishing.retry({ operationRef: publication.ref, idempotencyKey: publication.idempotencyKey });
        setPublication(result.data);
        goToRoute({ surface: "publication", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, operationId: result.data.ref.id, operationVersion: result.data.ref.version, view: "status" }, { replace: true });
      } else if (code === "audit.read") {
        const nextAudit = await repositories.audit.getProposalHistory({ proposalId: proposal.ref.id });
        setAudit(nextAudit);
        goToRoute({ surface: "proposal", resourceId: proposal.ref.id, resourceVersion: proposal.ref.version, view: "activity" });
      } else {
        throw new Error("That governed action is not available in this workspace build.");
      }
      return true;
    } catch (error) {
      const envelope = toDomainErrorEnvelope(error, `proposal-action-${code}`);
      setGovernedError(envelope.error.message);
      return false;
    } finally {
      setGovernedBusy(false);
    }
  }, [goToRoute, proposal, publication, repositories]);

  const loadLinePage = useCallback(async ({ cursor, nextIndex, nextHistory }) => {
    if (!preview?.ref || linePageBusy) return;
    const pageRequest = linePageRequestRef.current + 1;
    linePageRequestRef.current = pageRequest;
    const requestKey = currentFilterKeyRef.current;
    const sourceRefKey = `${preview.ref.id}:${preview.ref.version}`;
    linePageRetryRef.current = { cursor, nextIndex, nextHistory };
    setLinePageBusy(true);
    setLineLoadState("loading");
    setLineLoadError(null);
    try {
      const nextPage = await repositories.repricing.getPreview({
        ref: preview.ref,
        classification: classificationForView(statusFilter),
        query: debouncedQuery,
        channelId: channelFilter === "all" ? undefined : channelFilter,
        locationId: locationFilter === "all" ? undefined : locationFilter,
        cursor,
        limit: REPRICING_PAGE_LIMIT,
      });
      if (linePageRequestRef.current !== pageRequest || currentFilterKeyRef.current !== requestKey) return;
      setPreview((currentPreview) => `${currentPreview.ref.id}:${currentPreview.ref.version}` === sourceRefKey ? nextPage : currentPreview);
      setLinePageIndex(nextIndex);
      setLineCursorHistory(nextHistory);
      setSelectedLineId(nextPage.lines[0]?.id ?? "");
      setLineLoadState("ready");
      linePageRetryRef.current = null;
    } catch (error) {
      if (linePageRequestRef.current !== pageRequest || currentFilterKeyRef.current !== requestKey) return;
      setLineLoadError(toDomainErrorEnvelope(error, "repricing-lines-page"));
      setLineLoadState("error");
    } finally {
      if (linePageRequestRef.current === pageRequest) setLinePageBusy(false);
    }
  }, [channelFilter, debouncedQuery, linePageBusy, locationFilter, preview?.ref, repositories, statusFilter]);

  const onViewTabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = REPRICING_VIEWS.indexOf(statusFilter);
    let next = current;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = REPRICING_VIEWS.length - 1;
    if (event.key === 'ArrowRight') next = (current + 1) % REPRICING_VIEWS.length;
    if (event.key === 'ArrowLeft') next = (current - 1 + REPRICING_VIEWS.length) % REPRICING_VIEWS.length;
    const nextView = REPRICING_VIEWS[next];
    setStatusFilter(nextView);
    document.getElementById(`repricing-tab-${nextView}`)?.focus();
  };

  const selectLine = (lineId) => {
    inspectorOriginRef.current = document.querySelector(`[data-line-id="${lineId}"] .product-cell`);
    setSelectedLineId(lineId);
    setInspectorOpen(true);
    if (route.lineId || window.matchMedia("(max-width: 1023px)").matches) {
      goToRoute({ surface: "repricing", resourceId: preview?.ref?.id ?? "FX-004", resourceVersion: preview?.ref?.version, view: "preview", lineId }, { replace: true });
    }
  };

  const closeInspector = useCallback(() => {
    inspectorHandoffRef.current += 1;
    setInspectorReturnFocusLineId(selectedLineId);
    setInspectorOpen(false);
    if (route.surface === "repricing" && route.lineId) {
      currentFilterKeyRef.current = null;
      setLinePageIndex(0);
      setLineCursorHistory([null]);
      goToRoute({ surface: "repricing", resourceId: route.resourceId ?? "FX-004", resourceVersion: route.resourceVersion ?? preview?.ref?.version, view: "preview" }, { replace: true });
    }
  }, [goToRoute, preview?.ref?.version, route.lineId, route.resourceId, route.resourceVersion, route.surface, selectedLineId]);

  const prepareLinePageTransition = useCallback(() => {
    inspectorHandoffRef.current += 1;
    setInspectorOpen(false);
    setInspectorReturnFocusLineId(null);
    if (route.surface === "repricing" && route.lineId) {
      goToRoute({ surface: "repricing", resourceId: route.resourceId ?? "FX-004", resourceVersion: route.resourceVersion ?? preview?.ref?.version, view: "preview" }, { replace: true });
    }
  }, [goToRoute, preview?.ref?.version, route.lineId, route.resourceId, route.resourceVersion, route.surface]);

  const previousLinePage = useCallback(() => {
    if (linePageBusy || linePageIndex === 0) return;
    prepareLinePageTransition();
    loadLinePage({ cursor: lineCursorHistory[linePageIndex - 1] ?? null, nextIndex: linePageIndex - 1, nextHistory: lineCursorHistory });
  }, [lineCursorHistory, linePageBusy, linePageIndex, loadLinePage, prepareLinePageTransition]);

  const nextLinePage = useCallback(() => {
    if (linePageBusy || !preview?.page?.nextCursor) return;
    const nextHistory = [...lineCursorHistory.slice(0, linePageIndex + 1), preview.page.nextCursor];
    prepareLinePageTransition();
    loadLinePage({ cursor: preview.page.nextCursor, nextIndex: linePageIndex + 1, nextHistory });
  }, [lineCursorHistory, linePageBusy, linePageIndex, loadLinePage, prepareLinePageTransition, preview?.page?.nextCursor]);

  const moveInspector = useCallback((direction) => {
    if (!filteredRows.length) return;
    const index = Math.max(0, filteredRows.findIndex((row) => row.id === selectedLineId));
    const next = filteredRows[(index + direction + filteredRows.length) % filteredRows.length];
    inspectorMoveFocusRef.current = true;
    setSelectedLineId(next.id);
    if (route.lineId || window.matchMedia("(max-width: 1023px)").matches) {
      goToRoute({ surface: "repricing", resourceId: preview?.ref?.id ?? "FX-004", resourceVersion: preview?.ref?.version, view: "preview", lineId: next.id }, { replace: true });
    }
  }, [filteredRows, goToRoute, preview?.ref?.id, preview?.ref?.version, route.lineId, selectedLineId]);

  if (route.surface === "login") {
    return <LoginScreen repositories={repositories} session={session} marketingHref={siteHref} onSignedIn={async (resolvedSession) => {
      const destination = routeFromReturnTo(route.returnTo);
      setSession(resolvedSession);
      if (loadState !== "ready") await loadWorkspace();
      goToRoute(destination, { replace: true });
    }} />;
  }

  const governedRoute = route.surface === "operation"
    ? { ...route, surface: "publication" }
    : route.surface === "proposal-override"
      ? { ...route, surface: "proposal-approval" }
      : route;
  const governedRouteError = protectedRouteVersionError(route);

  return (
    <div className={`workspace-app${sidebarCollapsed ? " is-nav-collapsed" : ""}`}>
      <SideNavigation openPanel={openPanel} onPanelChange={setOpenPanel} onNavigate={navigate} session={session} activeLabel={activeNavigationLabel(route.surface)} collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebar} />
      <div className="workspace-body">
        <TopBar
          openPanel={openPanel}
          onPanelChange={setOpenPanel}
          onSignOut={signOut}
          session={session}
          marketingHref={siteHref}
          routeLabel={activeNavigationLabel(route.surface)}
          evidenceActors={evidenceActors}
          onSelectEvidenceActor={selectEvidenceActor}
        />
        <main className={`workspace-main${route.surface === "repricing" ? " workspace-main--wide" : ""}`}>
          {loadState !== "ready" ? <WorkspaceLoadState state={loadState} error={loadError} onRetry={loadWorkspace} /> : OPERATIONAL_SURFACES.has(route.surface) ? <OperationalWorkspace key={`${routeNavigationKey(route)}:${session.actor.id}:${session.capabilityVersion}`} route={route} repositories={repositories} session={session} onNavigate={goToRoute} /> : route.surface === "repricing" && preview ? <>
          <header className="page-head">
            <div>
              <div className="breadcrumbs"><span>Scope</span><CaretRight aria-hidden="true" /><span>Price adjustment</span><CaretRight aria-hidden="true" /><span>Preview</span></div>
              <h1>{preview.title}</h1>
              <p className="page-meta">
                <span><FileCsv aria-hidden="true" />Supplier baseline</span>
                <strong>Price adjustment · {ruleLabel}</strong>
                <span>Effective {formatEffectiveAt(preview.effectiveAt, session.organisation.timezone)}</span>
              </p>
            </div>
            <div className="page-actions">
              <button type="button" className="review-action" onClick={() => setStatusFilter("review")}><ShieldWarning aria-hidden="true" /><span>Review {preview.counts.blocked.toLocaleString("en-NG")}</span></button>
              <button type="button" className="create-action" onClick={() => existingProposalRef ? goToRoute({ surface: "proposal", resourceId: existingProposalRef.id, resourceVersion: existingProposalRef.version, view: "overview" }) : setDialogOpen(true)} disabled={!currentProposalAction?.enabled} title={currentProposalAction?.enabled ? undefined : currentProposalAction?.reason?.message}><span>{existingProposalRef ? "Open Proposal" : "Create Proposal"}</span><ArrowRight aria-hidden="true" /></button>
              <small role={currentProposalAction?.enabled === false ? "status" : undefined}><ShieldWarning aria-hidden="true" />{proposalActionHelper}</small>
            </div>
          </header>

          <ScopeSummary counts={preview.counts} />

          <section ref={workSurfaceRef} className="work-surface" aria-label="Repricing preview">
            <header className="surface-toolbar">
              <div ref={viewTabsRef} className={`view-tabs${viewTabOverflow.before ? " has-overflow-before" : ""}${viewTabOverflow.after ? " has-overflow-after" : ""}`} role="tablist" aria-label="Repricing lines">
                <button id="repricing-tab-all" type="button" role="tab" aria-controls="repricing-lines-panel" aria-selected={statusFilter === "all"} tabIndex={statusFilter === "all" ? 0 : -1} className={statusFilter === "all" ? "is-active" : ""} onKeyDown={onViewTabKeyDown} onClick={() => setStatusFilter("all")}>All lines <span>{preview.counts.total.toLocaleString("en-NG")}</span></button>
                <button id="repricing-tab-review" type="button" role="tab" aria-controls="repricing-lines-panel" aria-selected={statusFilter === "review"} tabIndex={statusFilter === "review" ? 0 : -1} className={statusFilter === "review" ? "is-active" : ""} onKeyDown={onViewTabKeyDown} onClick={() => setStatusFilter("review")}>Need review <span>{preview.counts.blocked.toLocaleString("en-NG")}</span></button>
                <button id="repricing-tab-eligible" type="button" role="tab" aria-controls="repricing-lines-panel" aria-selected={statusFilter === "eligible"} tabIndex={statusFilter === "eligible" ? 0 : -1} className={statusFilter === "eligible" ? "is-active" : ""} onKeyDown={onViewTabKeyDown} onClick={() => setStatusFilter("eligible")}>Eligible <span>{preview.counts.eligible.toLocaleString("en-NG")}</span></button>
                <button id="repricing-tab-excluded" type="button" role="tab" aria-controls="repricing-lines-panel" aria-selected={statusFilter === "excluded"} tabIndex={statusFilter === "excluded" ? 0 : -1} className={statusFilter === "excluded" ? "is-active" : ""} onKeyDown={onViewTabKeyDown} onClick={() => setStatusFilter("excluded")}>Excluded <span>{preview.counts.excluded.toLocaleString("en-NG")}</span></button>
                <button id="repricing-tab-unpriced" type="button" role="tab" aria-controls="repricing-lines-panel" aria-selected={statusFilter === "unpriced"} tabIndex={statusFilter === "unpriced" ? 0 : -1} className={statusFilter === "unpriced" ? "is-active" : ""} onKeyDown={onViewTabKeyDown} onClick={() => setStatusFilter("unpriced")}>Unpriced <span>{preview.counts.unpriced.toLocaleString("en-NG")}</span></button>
              </div>
              <div className="table-tools">
                <label><MagnifyingGlass aria-hidden="true" /><span className="sr-only">Search lines</span><input id="line-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SKU or product" /></label>
                <button type="button" className="tool-button" aria-label={activeFilterCount ? `Filters, ${activeFilterCount} active` : "Filters"} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><FunnelSimple aria-hidden="true" /><span>Filters</span>{activeFilterCount ? <em>{activeFilterCount}</em> : null}</button>
                <button type="button" className="icon-control" aria-label={compact ? "Use comfortable rows" : "Use compact rows"} onClick={() => setCompact((value) => !value)}>{compact ? <Rows aria-hidden="true" /> : <GridFour aria-hidden="true" />}</button>
              </div>
            </header>

            {filtersOpen ? <div className="filter-strip" aria-label="Repricing filters">
              <span>Scope</span>
              <label><span className="sr-only">Filter by channel</span><select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}><option value="all">All channels</option>{channelOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
              <label><span className="sr-only">Filter by location</span><select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option value="all">All locations</option>{locationOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
              <button type="button" onClick={() => setStatusFilter("review")}>Policy issues <strong>{preview.counts.blocked.toLocaleString("en-NG")}</strong></button>
              <button className="filter-strip__clear" type="button" onClick={() => { setStatusFilter("all"); setChannelFilter("all"); setLocationFilter("all"); setFiltersOpen(false); }}>Clear</button>
            </div> : null}

            <div className={`surface-body${inspectorOpen && selectedRow ? " has-inspector" : ""}`} id="repricing-lines-panel" role="tabpanel" aria-labelledby={`repricing-tab-${statusFilter}`} aria-busy={lineLoadState === "loading"}>
              <div
                className="table-region"
                aria-hidden={inspectorOpen && selectedRow && inspectorOwnsSurface ? "true" : undefined}
                inert={inspectorOpen && selectedRow && inspectorOwnsSurface ? true : undefined}
              >
                <div className={`population-note${lineLoadState === "loading" ? " is-loading" : ""}`} role="status" aria-live="polite"><Info aria-hidden="true" /><span>{lineLoadState === "loading" ? "Updating this line view from the repricing source…" : `Scope reconciled across ${preview.counts.total.toLocaleString("en-NG")} lines.`}</span><strong>{filteredRows.length} lines loaded</strong></div>
                {lineLoadError ? <div className="line-load-error" role="alert"><ShieldWarning aria-hidden="true" /><span><strong>Line view could not be refreshed.</strong><small>{lineLoadError.error.message}</small></span><button type="button" onClick={() => linePageRetryRef.current ? loadLinePage(linePageRetryRef.current) : setLineRetryToken((value) => value + 1)}>Retry</button></div> : null}
                {filteredRows.length ? <ProductTable rows={filteredRows} selectedLineId={inspectorOpen ? selectedLineId : null} onSelect={selectLine} compact={compact} ruleLabel={ruleLabel} /> : <div className="empty-state"><MagnifyingGlass aria-hidden="true" /><strong>No lines match this view.</strong><button type="button" onClick={() => { setQuery(""); setStatusFilter("all"); setChannelFilter("all"); setLocationFilter("all"); }}>Clear filters</button></div>}
                <CursorPager
                  pageIndex={linePageIndex}
                  pageSize={preview.page.limit ?? REPRICING_PAGE_LIMIT}
                  returnedCount={filteredRows.length}
                  matchedCount={preview.filterResult?.sample?.matchedLineCount ?? filteredRows.length}
                  authoritativeCount={preview.counts.total}
                  itemLabel="lines"
                  scopeLabel="in scope"
                  hasNext={Boolean(preview.page.nextCursor)}
                  busy={linePageBusy}
                  onPrevious={previousLinePage}
                  onNext={nextLinePage}
                />
              </div>
              {inspectorOpen && selectedRow ? <button type="button" className="consequence-lens-scrim" tabIndex="-1" aria-hidden="true" onClick={closeInspector} /> : null}
              {inspectorOpen && selectedRow ? <ConsequenceLens
                key={selectedRow.id}
                lensRef={inspectorRef}
                row={selectedRow}
                ruleLabel={ruleLabel}
                proposalAuthority={proposalAuthority}
                onClose={closeInspector}
                onMove={moveInspector}
                onRemediate={performLineRemediation}
                remediationBusy={remediationBusy}
                remediationError={remediationError}
                position={Math.max(1, filteredRows.findIndex((row) => row.id === selectedRow.id) + 1)}
                total={filteredRows.length}
              /> : null}
            </div>
          </section>
          </> : route.surface === "repricing" ? <WorkspaceLoadState state="loading" error={null} onRetry={null} /> : governedLoadState === "ready" && proposal && governedPreview && !governedRouteError ? <ProposalWorkspace
            route={governedRoute}
            proposal={proposal}
            publication={publication}
            audit={audit}
            previewLines={governedPreview.lines}
            proposalRepository={repositories.proposals}
            ruleLabel={repricingRuleLabel(governedPreview.rule, session?.organisation.locale ?? "en-NG")}
            session={session}
            busy={governedBusy}
            error={governedError}
            onNavigate={goToRoute}
            onPerformAction={performProposalAction}
          /> : <WorkspaceLoadState state={governedRouteError || governedLoadState === "error" ? "error" : "loading"} error={governedRouteError ?? governedLoadError} onRetry={governedRouteError ? null : () => loadGovernedContext({ protectedSurface: route.surface, protectedView: route.view, expectedProposalId: route.resourceId, expectedProposalVersion: route.resourceVersion, expectedOperationId: route.operationId, expectedOperationVersion: route.operationVersion, expectedOverrideId: route.overrideId, expectedOverrideVersion: route.overrideVersion, resolvedSession: session })} />}
        </main>
      </div>
      {openPanel === "mobile" ? <div className="workspace-scrim" role="presentation" onMouseDown={() => setOpenPanel(null)} /> : null}
      {openPanel === "mobile" ? <MobileNavigation onClose={() => setOpenPanel(null)} onNavigate={navigate} onSignOut={signOut} marketingHref={siteHref} session={session} activeLabel={activeNavigationLabel(route.surface)} /> : null}
      {dialogOpen ? <ProposalDialog onClose={() => setDialogOpen(false)} onSubmit={createProposal} preview={preview} session={session} action={createProposalAction} /> : null}
      {notice ? <div className={`toast${notice.kind === "info" ? " is-info" : ""}`} role="status">{notice.kind === "info" ? <Info aria-hidden="true" /> : <CheckCircle aria-hidden="true" />}<span><strong>{notice.title}</strong><small>{notice.detail}</small></span><button className="icon-control" type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification"><X aria-hidden="true" /></button></div> : null}
    </div>
  );
}

export function WorkspaceApp({
  repositories,
  runtimeConfig = WORKSPACE_RUNTIME_CONFIG,
  navigateExternal = navigateExternalDestination,
}) {
  const composition = useMemo(() => {
    if (repositories) return { repositories, error: null };
    try {
      return {
        repositories: createWorkspaceRepositories({
          mode: runtimeConfig.mode,
          apiBaseUrl: runtimeConfig.apiBaseUrl,
          latencyMs: runtimeConfig.fixtureLatencyMs,
        }),
        error: null,
      };
    } catch (error) {
      return {
        repositories: null,
        error: toDomainErrorEnvelope(error, "workspace-composition"),
      };
    }
  }, [repositories, runtimeConfig.apiBaseUrl, runtimeConfig.fixtureLatencyMs, runtimeConfig.mode]);

  if (composition.error) {
    return <WorkspaceLoadState state="error" error={composition.error} onRetry={null} />;
  }
  return <WorkspaceApplication repositories={composition.repositories} runtimeConfig={runtimeConfig} navigateExternal={navigateExternal} />;
}
