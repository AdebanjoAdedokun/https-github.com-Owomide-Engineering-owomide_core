import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretDown, Check } from "@phosphor-icons/react";
import "./workspace-select.css";

/** Select-only combobox. Browsing options never commits a workflow action. */
export function WorkspaceSelect({ label, value, onChange, options, placeholder = "Choose an option", disabled = false }) {
  const id = useId();
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(value);
  const [position, setPosition] = useState(null);
  const unavailable = disabled || options.length === 0;
  const expanded = open && !unavailable;
  const selected = options.find((option) => option.value === value);
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === activeValue));
  const optionId = (index) => `${id}-option-${index}`;

  const dismiss = () => { setOpen(false); searchRef.current = { text: "", at: 0 }; };
  const show = (last = false) => {
    if (unavailable) return;
    setActiveValue(selected?.value ?? options[last ? options.length - 1 : 0].value);
    searchRef.current = { text: "", at: 0 };
    setOpen(true);
  };
  const choose = (option) => {
    if (unavailable || !option) return;
    onChange(option.value);
    dismiss();
    triggerRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => { if (unavailable) setOpen(false); }, [unavailable]);
  useLayoutEffect(() => {
    if (!expanded) { setPosition(null); return; }
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const inset = 12;
      const startX = (viewport?.offsetLeft ?? 0) + inset;
      const startY = (viewport?.offsetTop ?? 0) + inset;
      const endX = startX + (viewport?.width ?? window.innerWidth) - inset * 2;
      const endY = startY + (viewport?.height ?? window.innerHeight) - inset * 2;
      // A scrolled-away control must not leave a detached menu floating on screen.
      if (rect.bottom < startY || rect.top > endY) { setOpen(false); return; }
      const below = Math.max(0, endY - rect.bottom - 8);
      const above = Math.max(0, rect.top - startY - 8);
      const desired = Math.min(280, listRef.current?.scrollHeight || 280);
      const upward = below < desired && above > below;
      const width = Math.min(rect.width, Math.max(0, endX - startX));
      const maxHeight = Math.min(280, upward ? above : below);
      setPosition({
        left: Math.max(startX, Math.min(rect.left, endX - width)),
        width, maxHeight,
        top: upward ? rect.top - 8 : rect.bottom + 8,
        transform: upward ? "translateY(-100%)" : undefined,
      });
    };
    const outside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !listRef.current?.contains(event.target)) dismiss();
    };
    place();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (triggerRef.current) observer?.observe(triggerRef.current);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      observer?.disconnect();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    // Scroll the list, never the page, when keyboard focus moves off its edge.
    const list = listRef.current;
    const option = list?.children[activeIndex];
    if (!option) return;
    const bottom = option.offsetTop + option.offsetHeight;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [activeIndex, expanded]);

  const onKeyDown = (event) => {
    if (unavailable) return;
    const key = event.key;
    if (key === "Tab") { dismiss(); return; }
    if (key === "Escape") {
      if (expanded) { event.preventDefault(); event.stopPropagation(); dismiss(); }
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
      event.preventDefault();
      if (!expanded) show(key === "ArrowUp" || key === "End");
      const next = key === "Home" ? 0 : key === "End" ? options.length - 1
        : Math.max(0, Math.min(options.length - 1, activeIndex + (key === "ArrowDown" ? 1 : -1)));
      if (expanded || key === "Home" || key === "End") setActiveValue(options[next].value);
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (expanded) choose(options[activeIndex]); else show();
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const at = Date.now();
      const prior = at - searchRef.current.at < 700 ? searchRef.current.text : "";
      const text = `${prior}${key.toLocaleLowerCase()}`;
      searchRef.current = { text, at };
      const repeated = [...text].every((letter) => letter === text[0]);
      const query = repeated ? text[0] : text;
      const start = expanded ? activeIndex + (query.length === 1 ? 1 : 0) : 0;
      const match = options.map((_, offset) => options[(start + offset) % options.length])
        .find((option) => option.label.toLocaleLowerCase().startsWith(query));
      if (!expanded) setOpen(true);
      if (match) setActiveValue(match.value);
    }
  };

  return <div className="workspace-select">
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>{label}</label>
    <button ref={triggerRef} id={`${id}-trigger`} type="button" role="combobox"
      className="workspace-select-trigger" disabled={unavailable}
      aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-expanded={expanded}
      aria-controls={expanded ? `${id}-list` : undefined}
      aria-activedescendant={expanded ? optionId(activeIndex) : undefined}
      onClick={() => expanded ? dismiss() : show()} onKeyDown={onKeyDown}>
      <span className={selected ? "" : "workspace-select-placeholder"}>{selected?.label ?? placeholder}</span>
      <CaretDown aria-hidden="true" />
    </button>
    {expanded ? createPortal(<div ref={listRef} id={`${id}-list`} role="listbox"
      className="workspace-select-list" aria-labelledby={`${id}-label`}
      style={{ ...position, visibility: position ? "visible" : "hidden" }}>
      {options.map((option, index) => <div key={option.value} id={optionId(index)} role="option"
        className="workspace-select-option" aria-selected={option.value === value}
        aria-labelledby={`${optionId(index)}-label`}
        aria-describedby={option.description ? `${optionId(index)}-description` : undefined}
        data-active={activeIndex === index ? "true" : undefined}
        onPointerMove={() => setActiveValue(option.value)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(option)}>
        <span className="workspace-select-option-copy"><span id={`${optionId(index)}-label`}>{option.label}</span>
          {option.description ? <small id={`${optionId(index)}-description`}>{option.description}</small> : null}</span>
        <Check className="workspace-select-check" aria-hidden="true" />
      </div>)}
    </div>, document.body) : null}
  </div>;
}
