import { CaretLeft, CaretRight } from "@phosphor-icons/react";

export const INSPECTOR_DOCK_MIN_SURFACE = 1500;

const number = (value) => Number(value ?? 0).toLocaleString("en-NG");

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
