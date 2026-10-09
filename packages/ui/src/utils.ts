import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(value: unknown) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

/** Indian short form: ₹24.8L, ₹1.42Cr, ₹8.4K */
export function compactMoney(value: unknown) {
  const amount = Number(value || 0);
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7, 2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5, 1)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3, 1)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

function trim(value: number, digits: number) {
  return Number(value.toFixed(digits)).toString();
}

export function number(value: unknown, digits = 0) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(Number(value || 0));
}

export function percent(value: unknown, digits = 1) {
  return `${Number(Number(value || 0).toFixed(digits))}%`;
}

export function formatDate(value: unknown, style: "short" | "medium" = "medium") {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", style === "short" ? { day: "2-digit", month: "short" } : { day: "2-digit", month: "short", year: "numeric" });
}

export function formatTime(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function relativeTime(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return "";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(date);
}

export function initials(name?: string | null) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** UNDER_REVIEW -> Under Review */
export function humanize(value?: unknown) {
  const text = String(value ?? "");
  if (!text) return "";
  if (/[a-z]/.test(text) && !text.includes("_")) return text.charAt(0).toUpperCase() + text.slice(1).replace(/([a-z])([A-Z])/g, "$1 $2");
  return text
    .toLowerCase()
    .split(/[_\s]+/)
    .map((part) => (part === "rfq" || part === "boq" || part === "ncr" || part === "po" ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
