"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { type OrderStatus } from "@/lib/fnb";

export function Icon({ name, className = "size-4", label }: { name: "check" | "alert" | "info" | "spinner"; className?: string; label?: string }) {
  const common = { className, "aria-hidden": label ? undefined : true, role: label ? "img" : undefined, "aria-label": label };
  if (name === "check") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></svg>;
  if (name === "alert") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...common}><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></svg>;
  if (name === "spinner") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...common}><path d="M20 12a8 8 0 1 1-2.3-5.7" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></svg>;
}
export function Button({ variant = "primary", loading, className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean }) {
  return <button className={"ll-btn ll-btn-" + variant + " " + className} disabled={props.disabled || loading} {...props}>{loading && <Icon name="spinner" label="Loading" />} {children}</button>;
}
export function StatusBadge({ tone, children }: { tone: "success" | "warning" | "error" | "info"; children: ReactNode }) { return <span className={"ll-status ll-status-" + tone}>{children}</span>; }
export function OrderStatusIndicator({ status }: { status: OrderStatus | string }) { const map = { received: ["success", "Received"], preparing: ["warning", "Preparing"], ready: ["info", "Ready"], completed: ["success", "Completed"] } as const; const fallback = ["info", status ? status.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()) : "Unknown"] as const; const [tone, label] = map[status as OrderStatus] || fallback; return <StatusBadge tone={tone}>{label}</StatusBadge>; }
export function Alert({ tone = "info", children }: { tone?: "success" | "warning" | "error" | "info"; children: ReactNode }) { return <div className={"ll-alert ll-status-" + tone} role={tone === "error" ? "alert" : "status"}>{tone === "error" || tone === "warning" ? <Icon name="alert" /> : <Icon name="info" />}{children}</div>; }
export function EmptyState({ title, children }: { title: string; children: ReactNode }) { return <div className="ll-panel-muted px-6 py-10 text-center"><h2 className="ll-section-title">{title}</h2><p className="mt-2 text-sm text-[var(--ll-muted)]">{children}</p></div>; }
