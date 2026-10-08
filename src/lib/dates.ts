const SAO_PAULO = "America/Sao_Paulo";

export const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const;

export const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

export function saoPauloToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const name = MONTHS[(month ?? 1) - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1 + delta, 1));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function daysInMonth(monthKey: string): string[] {
  const [year, month] = monthKey.split("-").map(Number);
  const count = new Date(Date.UTC(year, month ?? 1, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${year}-${String(month).padStart(2, "0")}-${day}`;
  });
}

/** Monday-first grid. Empty strings pad the first and last week. */
export function monthGrid(monthKey: string): string[] {
  const days = daysInMonth(monthKey);
  const first = new Date(`${days[0]}T12:00:00-03:00`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: SAO_PAULO,
  }).format(first);
  const mondayIndex: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const pad = mondayIndex[weekday] ?? 0;
  const cells = [...Array(pad).fill(""), ...days];
  while (cells.length % 7 !== 0) cells.push("");
  return cells;
}

export function formatLongDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00-03:00`);
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: SAO_PAULO,
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SAO_PAULO,
  }).format(date);
}

export function formatSaleOpening(isoLocal: string): string {
  const [date, time] = isoLocal.split("T");
  const [, month, day] = date.split("-");
  return `${day}/${month} às ${time.slice(0, 5)}`;
}

export function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
