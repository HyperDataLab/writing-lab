"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type SelectProps = {
  value: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
};

type MenuPosition = { top: number; left: number; width: number; maxHeight: number };

export function Select({ value, options, onValueChange, placeholder, ariaLabel, className = "" }: SelectProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selected = options.find((option) => option.value === value);
  const searchable = options.length > 7;
  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalized)) : options;
  }, [options, query]);
  const activeOption = visibleOptions[Math.min(activeIndex, Math.max(visibleOptions.length - 1, 0))];

  function openMenu() {
    const selectedIndex = visibleOptions.findIndex((option) => option.value === value && !option.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : Math.max(visibleOptions.findIndex((option) => !option.disabled), 0));
    setQuery("");
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    setQuery("");
    setPosition(null);
  }

  function choose(option?: SelectOption) {
    if (!option || option.disabled) return;
    onValueChange(option.value);
    closeMenu();
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement | HTMLInputElement>) {
    if (event.key === "Escape") { event.preventDefault(); closeMenu(); triggerRef.current?.focus(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { openMenu(); return; }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (!visibleOptions.length) return 0;
        let next = current;
        for (let attempts = 0; attempts < visibleOptions.length; attempts += 1) {
          next = (next + direction + visibleOptions.length) % visibleOptions.length;
          if (!visibleOptions[next].disabled) return next;
        }
        return current;
      });
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (!open) return;
      event.preventDefault();
      const indexes = visibleOptions.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
      if (indexes.length) setActiveIndex(event.key === "Home" ? indexes[0] : indexes[indexes.length - 1]);
      return;
    }
    const isSearchInput = event.currentTarget instanceof HTMLInputElement;
    if (event.key === "Enter" || (event.key === " " && !isSearchInput)) {
      event.preventDefault();
      if (!open) openMenu(); else choose(activeOption);
    }
  }

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 10;
      const above = rect.top - 10;
      const showAbove = below < 180 && above > below;
      const maxHeight = Math.max(100, Math.min(320, showAbove ? above : below));
      setPosition({
        top: showAbove ? Math.max(8, rect.top - maxHeight - 5) : rect.bottom + 5,
        left: Math.max(10, Math.min(rect.left, window.innerWidth - rect.width - 10)),
        width: Math.min(rect.width, window.innerWidth - 20),
        maxHeight,
      });
    };
    frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (searchable) searchRef.current?.focus();
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
        setQuery("");
        setPosition(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, searchable]);

  return <>
    <button ref={triggerRef} type="button" className={`select-trigger ${className}`.trim()} role="combobox"
      aria-label={ariaLabel} aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-listbox`}
      aria-activedescendant={open && activeOption ? `${id}-option-${Math.min(activeIndex, visibleOptions.length - 1)}` : undefined}
      onClick={() => open ? closeMenu() : openMenu()} onKeyDown={handleKeyDown}>
      <span className={selected ? "select-trigger-value" : "select-trigger-value is-placeholder"}>{selected?.label ?? placeholder ?? "Chọn một mục…"}</span>
      <ChevronDown className={open ? "select-trigger-chevron is-open" : "select-trigger-chevron"} size={16} aria-hidden="true" />
    </button>
    {open && position && createPortal(<div ref={menuRef} className="select-popover" style={position}>
      {searchable && <div className="select-search"><Search size={15} aria-hidden="true" /><input ref={searchRef} type="search" value={query} placeholder="Tìm trong danh sách…" aria-label={`Tìm ${ariaLabel.toLocaleLowerCase()}`} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} /></div>}
      <div className="select-options" id={`${id}-listbox`} role="listbox" aria-label={ariaLabel}>
        {visibleOptions.length ? visibleOptions.map((option, index) => <button id={`${id}-option-${index}`} key={option.value} type="button" role="option"
          aria-selected={option.value === value} aria-disabled={option.disabled || undefined} className={`select-option${index === activeIndex ? " is-active" : ""}${option.disabled ? " is-disabled" : ""}`}
          onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)} disabled={option.disabled}>
          <span>{option.label}</span>{option.value === value && <Check size={15} aria-hidden="true" />}
        </button>) : <p className="select-empty">Không có lựa chọn phù hợp.</p>}
      </div>
    </div>, document.body)}
  </>;
}
