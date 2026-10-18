"use client";

import { useEffect, useRef, useState, useId } from "react";

export type DropdownOption = {
  value: string;
  label: string;
  badge?: string;
  disabled?: boolean;
};

export interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: (DropdownOption | string)[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
  name?: string;
}

export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Select option",
  className = "",
  buttonClassName = "",
  disabled = false,
  "aria-label": ariaLabel,
  id: customId,
  name,
}: DropdownProps) {
  const generatedId = useId();
  const id = customId || generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Normalize options to DropdownOption format
  const normalizedOptions: DropdownOption[] = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;

    if (e.key === "Escape") {
      setIsOpen(false);
      e.preventDefault();
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      if (!isOpen) {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      const currentIndex = normalizedOptions.findIndex((opt) => opt.value === value);
      const step = e.key === "ArrowDown" ? 1 : -1;
      let nextIndex = currentIndex + step;

      if (nextIndex < 0) nextIndex = normalizedOptions.length - 1;
      if (nextIndex >= normalizedOptions.length) nextIndex = 0;

      const nextOption = normalizedOptions[nextIndex];
      if (nextOption && !nextOption.disabled) {
        onChange(nextOption.value);
      }
    }
  }

  function handleSelect(optValue: string, optDisabled?: boolean) {
    if (optDisabled) return;
    onChange(optValue);
    setIsOpen(false);
  }

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full text-left ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Hidden input for HTML form submissions if name is provided */}
      {name && <input type="hidden" name={name} value={value} />}

      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || displayLabel}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`flex min-h-[46px] w-full items-center justify-between gap-3 rounded-xl border-[1.5px] bg-white px-3.5 py-2.5 text-left text-sm font-semibold transition-all ${
          isOpen
            ? "border-[#C5A56A] shadow-sm ring-2 ring-[#C5A56A]/25"
            : "border-slate-300 text-[#0F172A] shadow-2xs hover:border-slate-400 hover:shadow-xs"
        } ${disabled ? "cursor-not-allowed opacity-60 bg-slate-50" : "cursor-pointer"} ${buttonClassName}`}
      >
        <span className="truncate block font-semibold text-[#0F172A]">
          {displayLabel}
        </span>

        <span
          className={`flex size-5 shrink-0 items-center justify-center text-slate-600 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[#C5A56A]" : ""
          }`}
        >
          <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* Floating Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95">
          <ul ref={listRef} role="listbox" aria-labelledby={id} className="space-y-0.5">
            {normalizedOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.value, opt.disabled)}
                  className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                    opt.disabled
                      ? "cursor-not-allowed opacity-40 text-slate-400"
                      : isSelected
                      ? "bg-slate-100 text-[#0F172A] font-bold"
                      : "cursor-pointer text-slate-800 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                >
                  <span className={`truncate block ${isSelected ? "font-bold text-[#0F172A]" : "font-semibold text-slate-800"}`}>
                    {opt.label}
                  </span>
                  {isSelected && (
                    <svg
                      className="size-4 shrink-0 text-[#C5A56A]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
