import { lazy, Suspense, useEffect, useRef, useState } from "react";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/noto-sans";
import { createWorkspaceLoginHref } from "./workspaceLogin.js";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowsClockwise,
  Broadcast,
  Buildings,
  CaretRight,
  ChartLineUp,
  Clock,
  CloudArrowUp,
  Code,
  CursorClick,
  Database,
  GitBranch,
  GlobeHemisphereWest,
  Lightning,
  List,
  LockKey,
  MagnifyingGlass,
  Package,
  PaperPlaneTilt,
  PlugsConnected,
  Scales,
  SealCheck,
  ShieldCheck,
  ShieldWarning,
  ShoppingCart,
  Storefront,
  Target,
  TrendDown,
  TrendUp,
  Truck,
  UsersThree,
  Waveform,
  X,
} from "@phosphor-icons/react";

const SignalChart = lazy(() => import("./SignalChart.jsx"));
const ProposalPolicyDonut = lazy(() => import("./ProposalPolicyDonut.jsx"));

const LOGOS = [
  { name: "Konga", file: "konga.svg" },
  { name: "Jumia", file: "jumia.svg" },
  { name: "Coca-Cola", file: "coca-cola.png" },
  { name: "SPAR", file: "spar.svg" },
  { name: "Prince Ebeano", file: "prince-ebeano.png" },
  { name: "Naivas", file: "naivas.svg" },
  { name: "Quickmart", file: "quickmart.png" },
  { name: "Carrefour", file: "carrefour.png" },
  { name: "Market Square", file: "market-square.png" },
  { name: "Shoprite", file: "shoprite.svg" },
  { name: "Simba Supermarket", file: "simba-supermarket.webp" },
  { name: "Sawa Citi", file: "sawa-citi.jpg" },
];

const INTEGRATION_MARKS = [
  { name: "SAP", file: "sap.svg", wordmark: true },
  { name: "Microsoft Dynamics 365", file: "microsoft.png", qualifier: "Dynamics 365" },
  { name: "Oracle NetSuite", file: "oracle.svg", qualifier: "NetSuite" },
  { name: "Sage", file: "sage.svg", wordmark: true },
  { name: "SYSPRO", file: "syspro.png", qualifier: "SYSPRO" },
  { name: "Odoo", file: "odoo.svg", wordmark: true },
  { name: "Shopify", file: "shopify.svg", qualifier: "Shopify" },
  { name: "WooCommerce", file: "woocommerce.svg", wordmark: true },
];

// Design-only founder profiles. Replace with approved names, roles and proof before publication.
const TEAM_PROFILES = [
  { name: "Tobi Adebayo", role: "Co-founder, Engineering", focus: "Platform architecture, data systems and AI engineering." },
  { name: "Amara Okafor", role: "Founder & CEO", focus: "Product direction, pricing strategy and customer discovery." },
  { name: "Kofi Mensah", role: "Co-founder, Commercial", focus: "Market development, partnerships and operating execution." },
];

const GOVERNANCE_STEPS = [
  { title: "Submitted", actor: "Pricing operator", person: "Teni Adebayo", time: "09:15 WAT", Icon: PaperPlaneTilt },
  { title: "Independently approved", actor: "Approver", person: "Chika Okafor", time: "10:02 WAT", Icon: ShieldCheck },
  { title: "Publication authorised", actor: "Publisher", person: "Farida Lawal", time: "10:48 WAT", Icon: LockKey },
  { title: "Publish verified", actor: "System", person: "Outcome reconciled", time: "10:51 WAT", Icon: SealCheck },
];

const CASSAVA_BEAT_DURATIONS = [2000, 800, 2400, 2100, 800, 1000, 2600, 4100, 1000];
const MARKET_BEAT_DURATIONS = [1600, 1200, 3000, 1200, 3000, 1200, 3000, 1900, 2200, 2400, 4200, 1200];
const GOVERNANCE_BEAT_DURATIONS = [4400, 4400, 4500, 4800, 5100, 1200];

const MARKET_SIGNALS = [
  {
    key: "fx",
    kind: "fx",
    eyebrow: "CURRENCY · NIGERIA",
    metric: "NGN/USD",
    movement: "+2.31%",
    direction: "up",
    tone: "attention",
    source: "Central-bank reference · 07:35 WAT",
    scope: "12 imported SKUs",
    detail: "₦1,485.12 → ₦1,519.44",
    callout: "7-day acceleration",
    data: [1485.12, 1494.2, 1488.7, 1502.4, 1508.6, 1501.8, 1513.2, 1507.5, 1517.4, 1512.9, 1518.6, 1519.44],
  },
  {
    key: "inflation",
    kind: "inflation",
    eyebrow: "FOOD INFLATION · KENYA",
    metric: "Staples index",
    movement: "+4.6%",
    direction: "up",
    tone: "attention",
    source: "National statistics feed · 08:10 EAT",
    scope: "21 catalogue matches",
    detail: "Above six-month baseline",
    callout: "Baseline exceeded",
    data: [108.2, 108.6, 109.1, 109.7, 110.2, 111.0, 111.8, 113.18],
  },
  {
    key: "competitor",
    kind: "competitor",
    eyebrow: "COMPETITOR · RWANDA",
    metric: "Matched basket",
    movement: "−3.8%",
    direction: "down",
    tone: "attention",
    source: "Retail market feed · 09:32 CAT",
    scope: "34 matched SKUs",
    detail: "Median gap below parity",
    callout: "Negative price cluster",
    data: [-7.1, -6.4, -5.8, -5.1, -4.7, -4.2, -3.9, -3.6, -3.2, -2.8, -2.4, -1.9, -1.3, 0.8],
  },
];

const PROPOSAL_PHASES = [
  {
    key: "draft",
    status: "Draft",
    eyebrow: "EVIDENCE COMPOSED",
    title: "Three market movements resolve into one scope.",
    detail: "The Proposal holds evidence, catalogue scope and policy context together.",
    receipt: "Prepared by Teni Adebayo",
    note: "Pricing operator · 09:12 WAT",
    result: "Awaiting submission",
    reference: "DRAFT 09:12",
    authority: "Draft preparation",
    authorityTitle: "Operator-owned work",
    authorityDetail: "Teni can prepare and submit this record. Approval remains a separate permission.",
    Icon: GitBranch,
  },
  {
    key: "submitted",
    status: "Submitted",
    eyebrow: "VERSION 1 SEALED",
    title: "The decision scope can no longer change in review.",
    detail: "Evidence and policy results are locked to one immutable review copy.",
    receipt: "Submitted by Teni Adebayo",
    note: "Pricing operator · 09:15 WAT",
    result: "Chika notified",
    reference: "V1-9F2C",
    authority: "Submission recorded",
    authorityTitle: "Independent review assigned",
    authorityDetail: "Version 1 is sealed. Chika can approve or return it, but cannot publish it.",
    Icon: PaperPlaneTilt,
  },
  {
    key: "approved",
    status: "Approved",
    eyebrow: "POLICY DECIDED",
    title: "Policy separates what can move from what must wait.",
    detail: "Independent review separates policy-clear changes from exceptions.",
    receipt: "Approved by Chika Okafor",
    note: "Independent approver · 10:02 WAT",
    result: "Publish authority required",
    reference: "DEC-1002",
    authority: "Approval recorded",
    authorityTitle: "Policy decision complete",
    authorityDetail: "Approval is recorded. Publication remains locked to a separate publisher.",
    Icon: ShieldCheck,
  },
  {
    key: "authorised",
    status: "Publication authorised",
    eyebrow: "RELEASE AUTHORISED",
    title: "Only policy-clear changes enter live channels.",
    detail: "The held scope stays outside the release while authorised destinations prepare.",
    receipt: "Authorised by Farida Lawal",
    note: "Publisher · 10:48 WAT",
    result: "Release AUTH-1048",
    reference: "AUTH-1048",
    authority: "Publication authority",
    authorityTitle: "Controlled release opened",
    authorityDetail: "Farida authorises only the policy-clear scope across the three destinations.",
    Icon: LockKey,
  },
  {
    key: "verified",
    status: "Live · verified",
    eyebrow: "OUTCOME RECONCILED",
    title: "Every authorised destination confirms the same result.",
    detail: "The release returns one verified receipt without changing the held scope.",
    receipt: "Verified by Owómidé",
    note: "System · 10:51 WAT",
    result: "Outcome complete",
    reference: "REC-1051",
    authority: "System verification",
    authorityTitle: "Outcome reconciled",
    authorityDetail: "ERP, POS and commerce return confirmation to the same authorised record.",
    Icon: SealCheck,
  },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function useInView(threshold = 0.2) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, visible];
}

function useLoopingSequence(active, reducedMotion, durations, finalStage = durations.length - 2) {
  const [state, setState] = useState({ stage: reducedMotion ? finalStage : 0, cycle: 0 });

  useEffect(() => {
    if (reducedMotion) {
      setState((current) => ({ stage: finalStage, cycle: current.cycle }));
      return undefined;
    }
    if (!active) return undefined;
    let cancelled = false;
    let timer;
    let stage = 0;
    let cycle = 0;

    const run = () => {
      if (cancelled) return;
      setState({ stage, cycle });
      timer = window.setTimeout(() => {
        stage += 1;
        if (stage >= durations.length) {
          stage = 0;
          cycle += 1;
        }
        run();
      }, durations[stage]);
    };

    run();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, durations, finalStage, reducedMotion]);

  return state;
}

function useDelayedStage(stage, reducedMotion, delay = 820, finalStage = 4) {
  const [delayedStage, setDelayedStage] = useState(reducedMotion ? finalStage : 0);

  useEffect(() => {
    if (reducedMotion) {
      setDelayedStage(finalStage);
      return undefined;
    }

    if (stage === 0) {
      setDelayedStage(0);
      return undefined;
    }

    // The final beat is a visual reset. Keep the verified Proposal mounted
    // while its dynamic layers retract, then return to Draft on the next beat.
    if (stage > finalStage) return undefined;

    const timer = window.setTimeout(() => setDelayedStage(stage), delay);
    return () => window.clearTimeout(timer);
  }, [delay, finalStage, reducedMotion, stage]);

  return delayedStage;
}

function scrollToSection(id, reducedMotion) {
  document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
}

function PrimaryButton({ children, onClick, className = "", type = "button", disabled = false, Icon = ArrowUpRight, showIcon = true }) {
  return (
    <button className={`primary-button ${showIcon ? "" : "primary-button--text-only"} ${className}`} type={type} onClick={onClick} disabled={disabled}>
      <span>{children}</span>
      {showIcon ? <span className="primary-button__icon"><Icon aria-hidden="true" /></span> : null}
    </button>
  );
}

function SiteHeader({ onContact, workspaceLoginHref, reducedMotion }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const links = [
    ["Product", "product"],
    ["Platform", "approach"],
    ["Roadmap", "roadmap"],
    ["Team", "team"],
  ];

  const followLink = (id) => {
    setMenuOpen(false);
    scrollToSection(id, reducedMotion);
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    window.requestAnimationFrame(() => mobileMenuRef.current?.querySelector("button")?.focus());
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <a className="brand-link" href="/" aria-label="Owómidé home">
        <img src="/assets/owomide-wordmark.png" alt="Owómidé" />
      </a>
      <nav className="desktop-nav" aria-label="Main navigation">
        {links.map(([label, id]) => (
          <button key={id} type="button" onClick={() => followLink(id)}>{label}</button>
        ))}
      </nav>
      <div className="header-actions">
        <a className="header-login" href={workspaceLoginHref}>Log in</a>
        <PrimaryButton className="header-cta" showIcon={false} onClick={() => onContact("demo")}>Book a demo</PrimaryButton>
      </div>
      <button
        ref={menuButtonRef}
        className="menu-button"
        type="button"
        aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
      >
        {menuOpen ? <X aria-hidden="true" /> : <List aria-hidden="true" />}
      </button>
      {menuOpen ? (
        <div className="mobile-menu" ref={mobileMenuRef}>
          {links.map(([label, id]) => (
            <button key={id} type="button" onClick={() => followLink(id)}>{label}<ArrowRight aria-hidden="true" /></button>
          ))}
          <a className="mobile-login" href={workspaceLoginHref} onClick={() => setMenuOpen(false)}>Log in <ArrowRight aria-hidden="true" /></a>
          <PrimaryButton showIcon={false} onClick={() => { menuButtonRef.current?.focus(); setMenuOpen(false); onContact("demo"); }}>Book a demo</PrimaryButton>
        </div>
      ) : null}
    </header>
  );
}

function BatchPreview({ stage }) {
  const counts = [
    ["In scope", "1,248"],
    ["Ready", "1,227"],
    ["Held for review", "17", true],
    ["Excluded", "12"],
    ["Unpriced", "9"],
  ];

  return (
    <div className="batch-preview" aria-hidden="true">
      <div className="batch-preview__heading">
        <div>
          <span>August cost recovery</span>
          <h3>Preview the effect before a price changes.</h3>
        </div>
        <span className="batch-preview__scope">Marketplace · Ibadan cross-dock</span>
      </div>

      <div className="preview-command">
        <span className="preview-command__icon"><ArrowsClockwise /></span>
        <span><small>Repricing preview</small><strong>Pass through landed-cost movement by 3.50%</strong></span>
        <span className="preview-command__state">{stage < 1 ? "Ready" : stage < 2 ? "Processing" : "Checked"}</span>
      </div>

      <div className="preview-processing">
        <span><Waveform /><b>{stage < 2 ? "Checking catalogue, policy and price history" : "Catalogue and policy checks complete"}</b></span>
        <span>{stage < 2 ? "1,248 lines" : "1,248 / 1,248"}</span>
        <i />
      </div>

      <div className="batch-preview__rows">
        <span><Package /><b>Long-grain rice · Classic</b><small>Ready</small></span>
        <span><Package /><b>Sunflower oil · 1 L</b><small>Ready</small></span>
        <span className="is-held"><Package /><b>Cassava flour · Select</b><small>Policy check</small></span>
        <span><Package /><b>Tomato paste · 400 g</b><small>Ready</small></span>
      </div>

      <dl className="batch-preview__counts">
        {counts.map(([label, value, risk]) => (
          <div className={risk ? "is-risk" : ""} key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>

      <div className="exception-focus">
        <span className="exception-focus__icon"><ShieldWarning /></span>
        <span><small>Review exceptions</small><strong>17 lines need a decision before submission</strong></span>
        <ArrowRight />
      </div>

      <span className="cassava-film__cursor"><CursorClick weight="fill" /></span>
    </div>
  );
}

function CassavaException() {
  return (
    <div className="cassava-exception" aria-hidden="true">
      <header className="cassava-exception__heading">
        <div><span>01 / 17 · POLICY EXCEPTION</span><h3>Cassava flour <em>· Select, 1 kg</em></h3><small>KLD-PANT-0032 · MARKETPLACE / IBADAN CROSS-DOCK</small></div>
        <span className="cassava-exception__held"><ShieldWarning />Held for review</span>
      </header>

      <div className="cassava-prices">
        <div className="cassava-prices__decision">
          <div className="cassava-prices__current"><span>Current price</span><strong>₦1,612.50</strong><small>Margin 6.01%</small></div>
          <div className="cassava-prices__change">
            <b>+3.50%</b>
            <span className="cassava-prices__change-line" aria-hidden="true"><i /><CaretRight weight="bold" /></span>
            <small>Increase <strong>+₦56.44</strong></small>
          </div>
          <div className="is-proposed"><span>Proposed price</span><strong>₦1,668.94</strong><small>Margin 9.19%</small></div>
        </div>
        <div className="is-floor"><span>Policy price</span><strong>₦1,762.21</strong><small>Required for 14.00%</small></div>
      </div>

      <div className="cassava-margin">
        <span><b>6.01%</b><small>Current</small></span>
        <span><b>9.19%</b><small>Proposed</small></span>
        <span><b>14.00%</b><small>Policy floor</small></span>
        <i><b /><em /><strong /></i>
      </div>

      <div className="cassava-validation">
        <span className="cassava-validation__icon"><ShieldWarning /></span>
        <span><small>POLICY VALIDATION</small><strong>Proposed margin remains 4.81 pp below policy.</strong><p>The policy floor is 14.00%, so this line requires review.</p></span>
        <span className="cassava-validation__state">Decision required</span>
      </div>

      <div className="cassava-exception__footer">
        <span><GitBranch /><b>Supplier baseline</b><small>Source row 33</small></span>
        <span><TrendUp /><b>Rule +3.50%</b><small>Effective 15 Aug</small></span>
      </div>
    </div>
  );
}

function HeroDemo({ reducedMotion, motionPaused }) {
  const [sectionRef, inView] = useInView(0.3);
  const { stage, cycle } = useLoopingSequence(inView && !motionPaused, reducedMotion, CASSAVA_BEAT_DURATIONS, 7);

  return (
    <section className="story-product" id="product" ref={sectionRef} aria-labelledby="cassava-film-title">
      <div className={`pricing-film pricing-stage-${stage} pricing-cycle-${cycle % 2}`}>
        <header className="pricing-film__bar">
          <img src="/assets/owomide-wordmark.png" alt="" aria-hidden="true" />
          <span><b>REPRICING · 02/07</b> August cost recovery</span>
          <span>Illustrative product preview</span>
        </header>
        <div className="pricing-film__viewport">
          <h2 className="sr-only" id="cassava-film-title">Repricing preview identifies a Cassava flour policy exception</h2>
          <BatchPreview stage={stage} />
          <CassavaException />
        </div>
      </div>
      <p className="sr-only">A repricing preview checks 1,248 catalogue lines. It identifies 1,227 ready lines and holds 17 for review. Cassava flour moves from ₦1,612.50 to ₦1,668.94, but the proposed 9.19 percent margin remains 4.81 percentage points below the 14 percent policy floor.</p>
    </section>
  );
}

function Hero({ onContact, reducedMotion, motionPaused }) {
  return (
    <section className="story-hero" id="top">
      <div className="story-hero__copy">
        <p className="eyebrow">THE PRICING OPERATING SYSTEM</p>
        <h1>Every price<br />has a<br />consequence<span>.</span></h1>
        <p>Owómidé turns market signals, cost movements and commercial policy into governed pricing decisions for every market, product and channel.</p>
        <div className="story-hero__actions">
          <PrimaryButton onClick={() => onContact("demo")}>Book a demo</PrimaryButton>
        </div>
      </div>
      <HeroDemo reducedMotion={reducedMotion} motionPaused={motionPaused} />
    </section>
  );
}

function TrustNetwork({ motionPaused }) {
  return (
    <section className={`story-trust ${motionPaused ? "is-motion-paused" : ""}`} aria-labelledby="trust-title">
      <div className="story-trust__copy">
        <p className="eyebrow">TRUSTED ACROSS COMMERCE</p>
        <h2 id="trust-title">Teams shaping how prices move.</h2>
      </div>
      <div className="story-logo-marquee">
        <div className="story-logo-marquee__track">
          {[0, 1].map((copy) => (
            <ul aria-label={copy === 0 ? "Commerce organisations" : undefined} aria-hidden={copy === 1 ? "true" : undefined} key={copy}>
              {LOGOS.map((logo) => (
                <li key={`${copy}-${logo.name}`}>
                  <img src={`/brands/${logo.file}`} alt={copy === 0 ? logo.name : ""} loading="lazy" />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProposalCard({ compact = false }) {
  const state = PROPOSAL_PHASES[0];
  const StateIcon = state.Icon;

  return (
    <article className={`proposal-card proposal-card--${state.key} ${compact ? "proposal-card--compact" : ""}`}>
      <header>
        <span>PROPOSAL 02/07</span>
        <strong><StateIcon aria-hidden="true" />{state.status}</strong>
      </header>
      <div className="proposal-card__body">
        <div className="proposal-card__summary">
          <small>GOVERNED HANDOFF</small>
          <h3>Proposal 02/07 is prepared.</h3>
          <p>Scope, evidence and policy results are attached in one review object.</p>
        </div>
        <div className="proposal-card__handoff">
          <GitBranch aria-hidden="true" />
          <span><small>EVIDENCE LINEAGE</small><strong>Locked to this draft</strong></span>
          <em>Awaiting operator</em>
        </div>
      </div>
    </article>
  );
}

function ProposalContinuitySurface({ phase, reducedMotion }) {
  const destinations = [
    ["ERP", Database],
    ["POS", Storefront],
    ["Commerce", ShoppingCart],
  ];

  return (
    <div className="proposal-continuity">
      <div className="proposal-continuity__lead-stack">
        {PROPOSAL_PHASES.map(({ key, eyebrow, title, detail, Icon }, index) => (
          <header className={`proposal-continuity__lead ${phase === index ? "is-active" : ""}`} key={key}>
            <span><Icon aria-hidden="true" /></span>
            <div><small>{eyebrow}</small><strong>{title}</strong><p>{detail}</p></div>
          </header>
        ))}
      </div>

      <div className="proposal-lineage">
        <div className="proposal-lineage__evidence">
          <span><i />FX <b>+2.31%</b></span>
          <span><i />Inflation <b>+4.6%</b></span>
          <span><i />Price gap <b>−3.8%</b></span>
        </div>

        <div className="proposal-lineage__stage">
          <div className="proposal-lineage__record">
            <div className="proposal-lineage__seal"><LockKey aria-hidden="true" /><span>Version 1 sealed</span></div>
            <div className="proposal-lineage__scope-view">
              <div className="proposal-lineage__scope-rail" aria-hidden="true"><i /></div>
              <span><strong>53</strong><small>products in scope</small></span>
            </div>
            <div className="proposal-lineage__decision-view">
              <Suspense fallback={<div className="proposal-policy-donut proposal-policy-donut--loading" aria-hidden="true" />}>
                {phase === 2 ? <ProposalPolicyDonut reducedMotion={reducedMotion} /> : null}
              </Suspense>
              <div className="proposal-policy-summary">
                <div className="is-clear">
                  <i aria-hidden="true" />
                  <span><strong>46</strong><small>Policy-clear</small></span>
                  <b>86.8%</b>
                </div>
                <div className="is-held">
                  <i aria-hidden="true" />
                  <span><strong>7</strong><small>Held for review</small></span>
                  <b>13.2%</b>
                </div>
                <p><LockKey aria-hidden="true" />Publication remains locked</p>
              </div>
            </div>
          </div>

          <div className="proposal-lineage__release">
            <div className="proposal-lineage__release-origin"><LockKey aria-hidden="true" /><span><small>AUTHORISED RECORD</small><strong>Proposal 02/07</strong></span></div>
            <i className="proposal-lineage__bus" aria-hidden="true" />
            <ul>
              {destinations.map(([destination, DestinationIcon], index) => (
                <li key={destination} style={{ "--destination-index": index }}>
                  <span><DestinationIcon aria-hidden="true" /></span>
                  <strong>{destination}</strong>
                  <small>Ready</small>
                </li>
              ))}
            </ul>
            <p><ShieldCheck aria-hidden="true" />Policy exceptions remain outside the release.</p>
          </div>

          <div className="proposal-lineage__proof">
            <span className="proposal-lineage__proof-icon"><SealCheck aria-hidden="true" /></span>
            <span className="proposal-lineage__proof-copy">
              <small>RECONCILIATION RECEIPT</small>
              <strong>46 / 46 authorised changes confirmed</strong>
              <em>ERP · POS · Commerce</em>
            </span>
            <span className="proposal-lineage__zero"><strong>0</strong><small>Mismatches</small></span>
          </div>
        </div>
      </div>

      <div className="proposal-continuity__receipt-stack">
        {PROPOSAL_PHASES.map(({ key, receipt, note, result, reference, Icon }, index) => (
          <div className={`proposal-continuity__receipt ${phase === index ? "is-active" : ""}`} key={key}>
            <span><Icon aria-hidden="true" /></span>
            <div><small>{receipt}</small><strong>{note}</strong></div>
            <code>{reference}</code>
            <em>{result}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProposalJourneyCard({ phase, filmRef, reducedMotion }) {
  const state = PROPOSAL_PHASES[Math.min(phase, PROPOSAL_PHASES.length - 1)];

  return (
    <article className={`proposal-journey-card proposal-journey-card--${state.key}`} ref={filmRef}>
      <header>
        <span>PROPOSAL 02/07</span>
        <strong className="proposal-status-stack">
          {PROPOSAL_PHASES.map(({ key, status, Icon }, index) => (
            <span className={phase === index ? "is-active" : ""} key={key}><Icon aria-hidden="true" />{status}</span>
          ))}
        </strong>
      </header>
      <section className="proposal-journey-card__identity">
        <small>REGIONAL EXPOSURE REVIEW</small>
        <h3>Respond to recorded pressure within policy.</h3>
        <p>Nigeria · Kenya · Rwanda · Version 1</p>
      </section>
      <div className="proposal-journey-card__viewport">
        <ProposalContinuitySurface phase={phase} reducedMotion={reducedMotion} />
      </div>
    </article>
  );
}

function GovernanceAuthorityLens({ phase }) {
  return (
    <div className="governance-authority-lens">
      <p>ACTIVE AUTHORITY</p>
      <div className="governance-authority-lens__stack">
        {PROPOSAL_PHASES.map(({ key, authority, authorityTitle, authorityDetail, receipt, note, Icon }, index) => (
          <article className={phase === index ? "is-active" : ""} key={key}>
            <span><Icon aria-hidden="true" /></span>
            <small>{authority}</small>
            <h3>{authorityTitle}</h3>
            <p>{authorityDetail}</p>
            <footer><strong>{receipt}</strong><em>{note}</em></footer>
          </article>
        ))}
      </div>
      <span className="governance-authority-lens__handoff" aria-hidden="true"><i /><b /></span>
    </div>
  );
}

function MarketSignalTile({ signal, index, stage, cycle, reducedMotion, storyActive }) {
  const revealStage = 1 + index * 2;
  const focusStage = 2 + index * 2;
  const revealed = reducedMotion || (stage >= revealStage && stage < 11);
  const current = ((stage === 0 || stage === 11) && index === 0) || stage === revealStage || stage === focusStage;
  const completed = reducedMotion || (stage > focusStage && stage < 11);
  const pending = !reducedMotion && (stage < revealStage || stage === 11);
  const focused = reducedMotion || stage === focusStage;
  const DirectionIcon = signal.direction === "down" ? TrendDown : TrendUp;

  return (
    <article className={`market-signal-tile market-signal-tile--${signal.kind} ${revealed ? "is-revealed" : ""} ${current ? "is-current" : ""} ${completed ? "is-complete" : ""} ${pending ? "is-pending" : ""} ${focused ? "is-focused" : ""}`}>
      <header>
        <span>
          <small>{signal.eyebrow}</small>
          <strong className="market-signal-tile__metric">
            <span>{signal.metric}</span>
            <span className={`market-signal-tile__movement is-${signal.tone}`}><DirectionIcon aria-hidden="true" weight="bold" />{signal.movement}</span>
          </strong>
        </span>
        <span className="market-signal-tile__status">{revealed ? "Recorded" : "Monitoring"}</span>
      </header>
      <Suspense fallback={<div className="signal-spark signal-spark--loading" aria-hidden="true" />}>
        {storyActive || reducedMotion ? (
          <SignalChart signal={signal} revealed={revealed} focused={focused} cycle={cycle} reducedMotion={reducedMotion} />
        ) : (
          <div className="signal-spark signal-spark--loading" aria-hidden="true" />
        )}
      </Suspense>
      <footer><span>{signal.source}</span><b>{signal.detail}</b><em>{signal.scope}</em></footer>
    </article>
  );
}

function IntelligenceSection({ reducedMotion, motionPaused }) {
  const [sectionRef, inView] = useInView(0.28);
  const { stage, cycle } = useLoopingSequence(inView && !motionPaused, reducedMotion, MARKET_BEAT_DURATIONS, 10);

  return (
    <section className={`story-intelligence market-stage-${stage}`} id="intelligence" aria-labelledby="intelligence-title">
      <header className="story-intelligence__intro">
        <p className="eyebrow">CONNECTED MARKET INTELLIGENCE</p>
        <h2 id="intelligence-title">Three movements.<br />One governed decision.</h2>
        <p>Owómidé maps the evidence changing a price to the products carrying the exposure, then prepares a policy-aware response.</p>
      </header>

      <div className="market-film" ref={sectionRef} aria-hidden="true">
        <header className="market-film__bar">
          <span><Broadcast /><b>MARKET SIGNALS</b></span>
          <span>14 Aug · 09:32 WAT</span>
          <span><SealCheck aria-hidden="true" />Sources fresh · 3/3</span>
        </header>

        <div className="market-film__canvas">
          <div className="market-film__signals">
            {MARKET_SIGNALS.map((signal, index) => (
              <MarketSignalTile key={signal.key} signal={signal} index={index} stage={stage} cycle={cycle} reducedMotion={reducedMotion} storyActive={inView} />
            ))}
          </div>

          <div className="market-film__evidence" aria-hidden="true">
            <span><i />Currency pressure</span>
            <span><i />Staples pressure</span>
            <span><i />Competitive pressure</span>
          </div>

          <div className="market-film__convergence" aria-hidden="true"><i /><i /><i /><span><MagnifyingGlass />67 matches <b>→</b> 53 unique products</span></div>

          <div className="market-film__handoff">
            <div className="exposure-ledger">
              <span className="exposure-ledger__icon"><Target /></span>
              <span><small>CATALOGUE EXPOSURE</small><strong>53 unique products carry the combined pressure.</strong><p>Matched across three markets, de-duplicated, then tested against margin and policy.</p></span>
              <dl><div><dt>Markets</dt><dd>3</dd></div><div><dt>Policy-clear</dt><dd>46</dd></div><div className="is-review"><dt>Review</dt><dd>7</dd></div></dl>
            </div>

            <ProposalCard compact />
          </div>
        </div>
      </div>
      <p className="sr-only">Currency movement in Nigeria, food inflation in Kenya and competitor movement in Rwanda produce 67 signal matches across 53 unique products. Seven require policy review. Owómidé prepares Proposal 02/07 as a Draft awaiting operator submission.</p>
    </section>
  );
}

function GovernanceSection({ reducedMotion, motionPaused }) {
  const [sectionRef, inView] = useInView(0.35);
  const { stage } = useLoopingSequence(inView && !motionPaused, reducedMotion, GOVERNANCE_BEAT_DURATIONS, 4);
  const proposalPhase = useDelayedStage(stage, reducedMotion);
  const authorityIndex = proposalPhase <= 0 ? -1 : Math.min(proposalPhase - 1, 3);
  const progress = stage === 5 ? 0 : stage <= 1 ? 0 : Math.min(1, (stage - 1) / 3);
  const handoffTravelling = stage === 1 && proposalPhase === 0;

  return (
    <section className={`story-governance governance-stage-${stage}`} id="governance" aria-labelledby="governance-title">
      <header className="story-governance__intro">
        <p className="eyebrow">GOVERNED EXECUTION</p>
        <h2 id="governance-title">The decision moves.<br />Authority stays separate.</h2>
        <p>Proposal 02/07 carries its evidence through review, approval, publishing and verification. Each role keeps a separate permission.</p>
      </header>

      <div className={`governance-film governance-film--${PROPOSAL_PHASES[proposalPhase].key} ${handoffTravelling ? "is-handoff-travelling" : ""} ${stage === 5 ? "is-resetting" : ""}`} aria-hidden="true">
        <ProposalJourneyCard phase={proposalPhase} filmRef={sectionRef} reducedMotion={reducedMotion} />

        <div className="governance-journey">
          <GovernanceAuthorityLens phase={proposalPhase} />
          <div className="governance-journey__rail" style={{ "--governance-progress": progress }}>
            <div className="governance-journey__line" aria-hidden="true"><i /><b /></div>
            <ol>
              {GOVERNANCE_STEPS.map(({ title, actor, person, time, Icon }, index) => {
                const current = authorityIndex === index;
                const complete = authorityIndex > index;
                return (
                  <li className={current ? "is-reached is-current" : complete ? "is-reached is-complete" : "is-upcoming"} key={title}>
                    <span className="governance-journey__node"><Icon aria-hidden="true" /></span>
                    <small>{title}</small>
                    <strong>{actor}</strong>
                    <p>{person}</p>
                    <time>{time}</time>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
      <p className="sr-only">Proposal 02/07 moves from pricing operator Teni Adebayo to approver Chika Okafor, publisher Farida Lawal and system verification. Forty-six authorised changes are verified while seven policy exceptions remain held.</p>
    </section>
  );
}

function PlatformLayers() {
  const layers = [
    { verb: "Sense", title: "Market intelligence", detail: "Costs, catalogue and market signals.", Icon: Broadcast },
    { verb: "Decide", title: "Pricing workspace", detail: "Scenarios, margins and policy.", Icon: Scales },
    { verb: "Govern", title: "Decision governance", detail: "Proposal, roles and approvals.", Icon: LockKey },
    { verb: "Execute", title: "Execution and learning", detail: "Publish, reconcile and improve.", Icon: PlugsConnected },
  ];

  return (
    <section className="story-system" id="approach" aria-labelledby="system-title">
      <header className="story-system__intro">
        <p className="eyebrow">THE FULL PRICING SYSTEM</p>
        <h2 id="system-title">One spine from evidence to outcome.</h2>
        <p>Start with governed pricing. Add intelligence, decision science and connected execution without rebuilding the workflow.</p>
      </header>

      <ol className="system-spine">
        {layers.map(({ verb, title, detail, Icon }, index) => (
          <li key={title}>
            <span className="system-ledger__number">0{index + 1}</span>
            <span className="system-ledger__icon"><Icon aria-hidden="true" /></span>
            <div><small>{verb}</small><h3>{title}</h3><p>{detail}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function IntegrationEcosystem() {
  return (
    <section className="integration-ecosystem" id="integrations" aria-labelledby="integration-title">
      <header className="integration-ecosystem__intro">
        <p className="eyebrow">CONNECTED EXECUTION</p>
        <h2 id="integration-title">Keep the systems that run commerce.</h2>
        <p>Owómidé is designed to read commercial context, govern the decision, then release and reconcile only authorised price changes.</p>
      </header>

      <div className="integration-ecosystem__canvas">
        <div className="integration-ecosystem__roster">
          <div className="integration-ecosystem__roster-heading">
            <span>PRIORITY CONNECTOR ECOSYSTEM</span>
            <small>Priority sequence</small>
          </div>
          <ul aria-label="Priority ERP and commerce platforms">
            {INTEGRATION_MARKS.map(({ name, file, qualifier, wordmark }) => (
              <li key={name}>
                <img src={`/integrations/${file}`} alt="" loading="lazy" />
                <span className={wordmark ? "sr-only" : undefined}>{qualifier || name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="integration-ecosystem__thread" aria-label="Connection boundary">
          <div>
            <Database aria-hidden="true" />
            <span><small>READ CONTEXT</small><strong>Catalogue · cost · inventory · policy</strong></span>
          </div>
          <ArrowRight aria-hidden="true" />
          <div className="integration-ecosystem__core" aria-label="Owómidé decision governance, governed Proposal">
            <small className="integration-ecosystem__core-kicker">DECISION GOVERNANCE</small>
            <div className="integration-ecosystem__core-mark">
              <img src="/assets/owomide-wordmark.png" alt="Owómidé" />
            </div>
            <span className="integration-ecosystem__core-status">Governed Proposal</span>
          </div>
          <ArrowRight aria-hidden="true" />
          <div>
            <SealCheck aria-hidden="true" />
            <span><small>WRITE &amp; VERIFY</small><strong>Authorised price · receipt · outcome</strong></span>
          </div>
        </div>

        <div className="integration-ecosystem__custom">
          <Code aria-hidden="true" />
          <span><small>CUSTOM CONNECTION</small><strong>Your ERP, POS, PIM or private stack.</strong></span>
          <p>Mapped files · API · webhooks · SFTP</p>
        </div>

        <p className="integration-ecosystem__disclosure">Platform marks identify connector priorities. They do not imply partnership or current native availability.</p>
      </div>
    </section>
  );
}

function RoadmapSection() {
  const phases = [
    { number: "01", horizon: "Now", system: "Pricing workspace", title: "Govern every price change.", detail: "Policy-aware preview, independent approval and verified publication." },
    { number: "02", horizon: "Next", system: "Market intelligence", title: "Connect evidence to exposure.", detail: "FX, inflation, supplier and competitor signals matched to catalogue and commercial impact." },
    { number: "03", horizon: "Horizon", system: "Decision science", title: "Learn from every outcome.", detail: "Forecasts, recommendations and controlled automation within explicit policy." },
  ];

  return (
    <section className="story-roadmap" id="roadmap" aria-labelledby="roadmap-title">
      <header>
        <p className="eyebrow">PRODUCT ROADMAP</p>
        <h2 id="roadmap-title">Control first.<br />Intelligence that compounds.</h2>
        <p>Owómidé expands what teams can sense and decide without changing the governance spine.</p>
        <div className="roadmap-constant">
          <ShieldCheck aria-hidden="true" />
          <span><small>CONSTANT AT EVERY HORIZON</small><strong>Evidence. Authority. Outcome.</strong></span>
        </div>
      </header>
      <div className="roadmap-ledger">
        <div className="roadmap-ledger__heading"><span>PRODUCT MATURITY</span><small>One governance spine</small></div>
        <ol className="roadmap-rail">
          {phases.map((phase) => (
            <li key={phase.horizon}>
              <span className="roadmap-rail__number">{phase.number}</span>
              <span className="roadmap-rail__node" aria-hidden="true" />
              <div className="roadmap-rail__meta"><small>{phase.horizon}</small><span>{phase.system}</span></div>
              <h3>{phase.title}</h3>
              <p>{phase.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function TeamSection() {
  return (
    <section className="team-section" id="team" aria-labelledby="team-title">
      <header className="team-section__intro">
        <p className="eyebrow">THE FOUNDING TEAM</p>
        <h2 id="team-title">Built close to the decisions that move a market.</h2>
        <p>We are building Owómidé around one conviction: every price change should carry its evidence, authority and outcome.</p>
      </header>
      <figure className="team-section__portrait">
        <img src="/team/founding-team-concept.webp" alt="Three Owómidé founders in a studio workspace" loading="lazy" />
      </figure>
      <ol className="team-section__profiles">
        {TEAM_PROFILES.map((profile, index) => (
          <li key={profile.name}>
            <span>0{index + 1}</span>
            <strong>{profile.name}</strong>
            <small>{profile.role}</small>
            <p>{profile.focus}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ContactSection({ onContact }) {
  return (
    <section className="contact-section" id="contact" aria-labelledby="contact-title">
      <div className="contact-section__copy">
        <p className="eyebrow">START A CONVERSATION</p>
        <h2 id="contact-title">Show us where pricing breaks down.</h2>
        <p>Whether you manage frequent cost changes, govern approvals or connect the systems prices move through, we would like to understand the workflow.</p>
      </div>
      <div className="contact-section__path">
        <ol>
          <li><span>01</span><strong>Choose the conversation</strong></li>
          <li><span>02</span><strong>Share the workflow</strong></li>
          <li><span>03</span><strong>Meet the Owómidé team</strong></li>
        </ol>
        <div className="contact-section__actions">
          <PrimaryButton onClick={() => onContact("demo")}>Book a demo</PrimaryButton>
          <button type="button" className="secondary-action" onClick={() => onContact("integration")}>Talk about an integration</button>
        </div>
      </div>
    </section>
  );
}

function SiteFooter({ onContact }) {
  return (
    <footer className="site-footer">
      <a href="/" className="site-footer__brand" aria-label="Owómidé home"><img src="/assets/owomide-wordmark-light.png" alt="Owómidé" /></a>
      <nav aria-label="Footer navigation">
        <a href="#product">Product</a>
        <a href="#approach">Platform</a>
        <a href="#integrations">Integrations</a>
        <a href="#roadmap">Roadmap</a>
        <a href="#team">Team</a>
        <a href="#contact">Contact</a>
      </nav>
      <button type="button" onClick={() => onContact("demo")}>Book a demo <ArrowUpRight aria-hidden="true" /></button>
      <p>© Owómidé 2026. Governed pricing for modern commerce.</p>
    </footer>
  );
}

function ContactDialog({ open, initialRoute, onClose }) {
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const [status, setStatus] = useState("editing");
  const [route, setRoute] = useState(initialRoute || "demo");

  const routes = {
    demo: { label: "Product demo", submit: "Book a demo" },
    design: { label: "Design partnership", submit: "Send design-partner request" },
    integration: { label: "Integration partnership", submit: "Start an integration conversation" },
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      triggerRef.current = document.activeElement;
      setStatus("editing");
      setRoute(initialRoute || "demo");
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [initialRoute, open]);

  const close = () => {
    dialogRef.current?.close();
    onClose();
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setStatus("submitting");
    window.setTimeout(() => setStatus("success"), 850);
  };

  return (
    <dialog
      className="early-access-dialog"
      ref={dialogRef}
      aria-labelledby="contact-dialog-title"
      aria-describedby="contact-dialog-description"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClose={() => onClose()}
    >
      <button className="dialog-close" type="button" onClick={close} aria-label="Close contact form"><X aria-hidden="true" /></button>
      {status === "success" ? (
        <div className="dialog-success">
          <span><SealCheck aria-hidden="true" /></span>
          <p className="eyebrow">REQUEST RECEIVED</p>
          <h2 id="contact-dialog-title">Thank you. We will review what you shared.</h2>
          <p id="contact-dialog-description">The Owómidé team reviews every message personally and will contact you when there is a clear next step.</p>
          <button type="button" onClick={close}>Return to Owómidé</button>
        </div>
      ) : (
        <div className="design-partner-dialog__layout">
          <aside className="design-partner-dialog__context">
            <p className="eyebrow">CONTACT OWÓMIDÉ</p>
            <h2 id="contact-dialog-title">Start a conversation.</h2>
            <p id="contact-dialog-description">Tell us what your pricing team needs to see.</p>
            <div>
              <small>WHAT HAPPENS NEXT</small>
              <ol>
                <li><span>01</span><p>We review the request.</p></li>
                <li><span>02</span><p>We understand the workflow.</p></li>
                <li><span>03</span><p>We agree a useful next step.</p></li>
              </ol>
            </div>
          </aside>

          <form onSubmit={submit}>
            <fieldset className="conversation-routes">
              <legend>Conversation</legend>
              <div>
                {Object.entries(routes).map(([key, option]) => (
                  <button key={key} type="button" aria-pressed={route === key} onClick={() => setRoute(key)}>{option.label}</button>
                ))}
              </div>
            </fieldset>
            <div className="form-grid">
              <label><span>Full name</span><input name="name" autoComplete="name" required placeholder="Your name" /></label>
              <label><span>Work email</span><input name="email" type="email" autoComplete="email" required placeholder="you@company.com" /></label>
              <label><span>Company</span><input name="company" autoComplete="organization" required placeholder="Company name" /></label>
              <label><span>Role</span><input name="role" autoComplete="organization-title" required placeholder="Your role" /></label>
              <label className="full-field"><span>What should we understand? <em>Optional</em></span><textarea name="context" placeholder="Markets, systems, catalogue scale or the decision at risk" /></label>
            </div>
            <PrimaryButton type="submit" disabled={status === "submitting"} Icon={status === "submitting" ? Clock : ArrowRight}>{status === "submitting" ? "Sending request" : routes[route].submit}</PrimaryButton>
            <small>We review every message personally. We will contact you when there is a clear next step.</small>
          </form>
        </div>
      )}
    </dialog>
  );
}

function WorkspaceLoginDialog({ open, onClose, onOpenProduct }) {
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const [status, setStatus] = useState("editing");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      triggerRef.current = document.activeElement;
      setStatus("editing");
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    dialogRef.current?.close();
    onClose();
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setStatus("submitting");
    window.setTimeout(() => setStatus("success"), 700);
  };

  return (
    <dialog className="workspace-login-dialog" ref={dialogRef} aria-labelledby="login-title" aria-describedby="login-description" onCancel={(event) => { event.preventDefault(); close(); }} onClose={onClose}>
      <button className="dialog-close" type="button" onClick={close} aria-label="Close workspace login"><X aria-hidden="true" /></button>
      {status === "success" ? (
        <div className="workspace-login-dialog__success">
          <span><LockKey aria-hidden="true" /></span>
          <p className="eyebrow">WORKSPACE PREVIEW</p>
          <h2 id="login-title">The product preview is ready.</h2>
          <p id="login-description">Authentication is represented in this prototype. Continue to the governed pricing workspace preview.</p>
          <PrimaryButton onClick={() => { close(); onOpenProduct(); }}>Open product preview</PrimaryButton>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p className="eyebrow">WORKSPACE ACCESS</p>
          <h2 id="login-title">Sign in to Owómidé.</h2>
          <p id="login-description">Access your organisation’s governed pricing workspace.</p>
          <label><span>Work email</span><input type="email" autoComplete="email" required placeholder="you@company.com" /></label>
          <label><span>Password</span><input type="password" autoComplete="current-password" required placeholder="Your password" /></label>
          <PrimaryButton type="submit" disabled={status === "submitting"} Icon={status === "submitting" ? Clock : ArrowRight}>{status === "submitting" ? "Signing in" : "Continue to workspace"}</PrimaryButton>
        </form>
      )}
    </dialog>
  );
}

export function App() {
  const reducedMotion = useReducedMotion();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogRoute, setDialogRoute] = useState("demo");
  const [motionPaused, setMotionPaused] = useState(false);

  const openContact = (route = "demo") => {
    setDialogRoute(route);
    setDialogOpen(true);
  };

  const workspaceLoginHref = createWorkspaceLoginHref({
    configuredUrl: import.meta.env.VITE_WORKSPACE_URL,
    location: typeof window === "undefined" ? undefined : window.location,
  });

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      {!reducedMotion ? (
        <button
          className="motion-access-control"
          type="button"
          aria-pressed={motionPaused}
          onClick={() => setMotionPaused((paused) => !paused)}
        >
          {motionPaused ? "Resume page motion" : "Pause page motion"}
        </button>
      ) : null}
      <SiteHeader onContact={openContact} workspaceLoginHref={workspaceLoginHref} reducedMotion={reducedMotion} />
      <main id="main-content">
        <Hero onContact={openContact} reducedMotion={reducedMotion} motionPaused={motionPaused} />
        <TrustNetwork motionPaused={motionPaused} />
        <IntelligenceSection reducedMotion={reducedMotion} motionPaused={motionPaused} />
        <GovernanceSection reducedMotion={reducedMotion} motionPaused={motionPaused} />
        <PlatformLayers />
        <IntegrationEcosystem />
        <RoadmapSection />
        <TeamSection />
        <ContactSection onContact={openContact} />
      </main>
      <SiteFooter onContact={openContact} />
      <ContactDialog open={dialogOpen} initialRoute={dialogRoute} onClose={() => setDialogOpen(false)} />
    </>
  );
}
