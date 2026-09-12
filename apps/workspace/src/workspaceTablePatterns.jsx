import { useLayoutEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

export const INSPECTOR_DOCK_MIN_SURFACE = 1500;

const number = (value) => Number(value ?? 0).toLocaleString("en-NG");

/** One filter-rail interaction for operational directories, including narrow surfaces. */
export function WorkspaceViewTabs({
  idPrefix,
  label,
  panelId,
  views,
  value,
  onChange,
  focusSelected = false,
  onFocusSelected,
}) {
  const railRef = useRef(null);
  const [overflow, setOverflow] = useState({ before: false, after: false });
  const contentKey = views.map(({ id, label: viewLabel, count }) => `${id}:${viewLabel}:${count ?? ""}`).join("|");

  useLayoutEffect(() => {
    const rail = railRef.current;
    const active = rail?.querySelector('[aria-selected="true"]');
    if (!rail || !active) return undefined;

    const updateOverflow = () => {
      const before = rail.scrollLeft > 2;
      const after = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2;
      setOverflow((current) => current.before === before && current.after === after ? current : { before, after });
    };
    const revealActive = (behavior = "auto") => {
      if (rail.scrollWidth <= rail.clientWidth) return;
      const railBox = rail.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      const inset = 8;
      const delta = activeBox.left < railBox.left + inset
        ? activeBox.left - railBox.left - inset
        : activeBox.right > railBox.right - inset ? activeBox.right - railBox.right + inset : 0;
      if (!delta) return;
      const left = Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, rail.scrollLeft + delta));
      // Scroll only this rail: changing a filter must not move the whole page.
      if (typeof rail.scrollTo === "function") rail.scrollTo({ left, behavior });
      else rail.scrollLeft = left;
    };
    const handleResize = () => { revealActive(); updateOverflow(); };

    if (focusSelected) {
      active.focus({ preventScroll: true });
      onFocusSelected?.();
    }
    const reducedMotion = globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    revealActive(reducedMotion ? "auto" : "smooth");
    updateOverflow();
    rail.addEventListener("scroll", updateOverflow, { passive: true });
    globalThis.window?.addEventListener?.("resize", handleResize);
    const observer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(handleResize) : null;
    observer?.observe(rail);
    observer?.observe(active);
    return () => {
      observer?.disconnect();
      rail.removeEventListener("scroll", updateOverflow);
      globalThis.window?.removeEventListener?.("resize", handleResize);
    };
  }, [value, contentKey, focusSelected, onFocusSelected]);

  const selectFromKey = (event, index) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? views.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + views.length) % views.length;
    railRef.current?.querySelectorAll('[role="tab"]')[nextIndex]?.focus({ preventScroll: true });
    onChange(views[nextIndex].id, { keyboard: true });
  };

  return <div ref={railRef} className={`ops-tabs workspace-view-tabs${overflow.before ? " has-overflow-before" : ""}${overflow.after ? " has-overflow-after" : ""}`} role="tablist" aria-label={label}>
    {views.map(({ id, label: viewLabel, count }, index) => <button
      id={`${idPrefix}-${id}`}
      key={id}
      type="button"
      role="tab"
      className={value === id ? "is-active" : ""}
      aria-controls={panelId}
      aria-selected={value === id}
      tabIndex={value === id ? 0 : -1}
      onKeyDown={(event) => selectFromKey(event, index)}
      onClick={() => onChange(id, { keyboard: false })}
    >{viewLabel}{count != null ? <span>{number(count)}</span> : null}</button>)}
  </div>;
}

export function CursorPager({
  pageIndex,
  pageSize,
  returnedCount,
  matchedCount,
  authoritativeCount,
  itemLabel = "rows",
  scopeLabel = "in scope",
  hasNext,
  busy = false,
  onPrevious,
  onNext,
}) {
  const safeMatchedCount = Number(matchedCount ?? returnedCount ?? 0);
  const safePageSize = Math.max(1, Number(pageSize ?? returnedCount ?? 1));
  const safeReturnedCount = Number(returnedCount ?? 0);
  const from = safeReturnedCount ? (pageIndex * safePageSize) + 1 : 0;
  const to = safeReturnedCount ? from + safeReturnedCount - 1 : 0;
  const pageCount = Math.max(1, Math.ceil(safeMatchedCount / safePageSize));
  const currentPage = Math.min(pageCount, pageIndex + 1);

  return <nav className="cursor-pager" aria-label={`${itemLabel} pagination`} aria-busy={busy}>
    <p className="cursor-pager__summary">
      <strong>{number(from)}–{number(to)}</strong>
      <span>of {number(safeMatchedCount)} sample {itemLabel}</span>
      {authoritativeCount != null ? <small>{number(authoritativeCount)} {scopeLabel}</small> : null}
    </p>
    <span className="cursor-pager__position" aria-live="polite">Page {number(currentPage)} of {number(pageCount)}</span>
    <span className="cursor-pager__actions">
      <button type="button" onClick={onPrevious} disabled={busy || pageIndex === 0} aria-label={`Previous ${itemLabel} page`}><CaretLeft aria-hidden="true" />Previous</button>
      <button type="button" onClick={onNext} disabled={busy || !hasNext} aria-label={`Next ${itemLabel} page`}>Next<CaretRight aria-hidden="true" /></button>
    </span>
  </nav>;
}
