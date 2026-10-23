import type { Decision, Status } from "./api";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function money(amount: number): string {
  return dollars.format(amount);
}

export function date(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

const CLAIM_TYPES: Partial<Record<string, string>> = {
  baggage: "Baggage",
  baggage_delay: "Baggage delay",
  emergency_medical: "Emergency medical",
  passport: "Passport",
  trip_cancellation: "Trip cancellation",
  trip_delay: "Trip delay",
  trip_interruption: "Trip interruption",
};

export function claimType(type: string): string {
  return CLAIM_TYPES[type] ?? type;
}

export const STATUS_LABELS: Record<Status, string> = {
  decided: "Decided",
  awaiting_signoff: "Waiting for sign-off",
  in_progress: "In progress",
  waiting: "Waiting",
};

export const STATUSES = Object.keys(STATUS_LABELS) as Status[];

export const DECISION_LABELS: Record<Decision, string> = {
  approve: "Approved",
  refer: "Referred",
  decline: "Declined",
};

export const DECISIONS = Object.keys(DECISION_LABELS) as Decision[];

export function countBy<K extends string, T>(
  keys: K[],
  items: T[],
  key: (item: T) => K | null,
): Record<K, number> {
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<
    K,
    number
  >;
  for (const item of items) {
    const k = key(item);
    if (k !== null) counts[k] += 1;
  }
  return counts;
}

export function percent(count: number, total: number): string {
  return `${String(total ? Math.round((count / total) * 100) : 0)}%`;
}

export function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function sentenceCase(name: string): string {
  const words = name.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
