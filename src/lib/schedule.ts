import type { ProgramItem, Session } from "@/lib/types";

export function screeningsOn(items: ProgramItem[], date: string): Array<{ item: ProgramItem; session: Session }> {
  return items
    .filter((item) => item.kind === "screening")
    .flatMap((item) => item.sessions.filter((session) => session.date === date).map((session) => ({ item, session })))
    .sort((a, b) => a.session.time.localeCompare(b.session.time) || a.item.title.localeCompare(b.item.title, "pt-BR"));
}

export function initialSelectedDate(items: ProgramItem[], today: string): string {
  const dates = items
    .flatMap((item) => item.sessions.map((session) => session.date))
    .filter(Boolean)
    .sort();
  if (dates.includes(today)) return today;
  return dates.find((date) => date >= today) ?? dates.at(-1) ?? today;
}
