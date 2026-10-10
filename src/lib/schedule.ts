import type { ProgramItem, Session } from "@/lib/types";

const SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function screeningsOn(items: ProgramItem[], date: string): Array<{ item: ProgramItem; session: Session }> {
  return items
    .filter((item) => item.kind === "screening")
    .flatMap((item) => item.sessions.filter((session) => session.date === date).map((session) => ({ item, session })))
    .sort((a, b) => a.session.time.localeCompare(b.session.time) || a.item.title.localeCompare(b.item.title, "pt-BR"));
}

export function spansOn(items: ProgramItem[], date: string): ProgramItem[] {
  return items
    .filter((item) => item.kind === "span" && item.span && item.span.start <= date && date <= item.span.end)
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

export function spanCue(span: { start: string; end: string; label: string }, date: string): string {
  if (span.label.startsWith("desde ")) return span.label;
  if (date < span.start) return `a partir de ${shortDay(span.start)}`;
  return `até ${shortDay(span.end)}`;
}

function shortDay(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1] ?? ""}`;
}

export function initialSelectedDate(items: ProgramItem[], today: string): string {
  const dates = items
    .flatMap((item) => item.sessions.map((session) => session.date))
    .filter(Boolean)
    .sort();
  const openToday = items.some((item) => item.span && item.span.start <= today && today <= item.span.end);
  if (dates.includes(today) || openToday) return today;
  return dates.find((date) => date >= today) ?? dates.at(-1) ?? today;
}
