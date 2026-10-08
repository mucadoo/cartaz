import { daysInMonth, saoPauloToday, shiftMonth } from "@/lib/dates";
import { fetchText } from "@/lib/http";
import type { ProgramItem, Session } from "@/lib/types";

const EVENTS_URL = "https://cinemateca.org.br/wp-json/tribe/events/v1/events";

type TribeImageSize = { url?: string | null };
type TribeEvent = {
  id?: number | null;
  title?: string | null;
  url?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  image?: { url?: string | null; sizes?: Record<string, TribeImageSize | undefined> } | false | null;
  venue?: { venue?: string | null } | null;
  categories?: { name?: string | null }[] | null;
};

type TribePage = {
  events?: TribeEvent[] | null;
  next_rest_url?: string | null;
  total_pages?: number | null;
};

type SourceResult = { items: ProgramItem[]; warnings: string[] };

function cleanText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitStamp(stamp: string | null | undefined): { date: string; time: string } | null {
  const match = stamp?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (!match) return null;
  return { date: match[1], time: match[2] };
}

function imageOf(event: TribeEvent): string | null {
  const image = event.image;
  if (!image || typeof image !== "object") return null;
  return image.sizes?.medium_large?.url ?? image.sizes?.medium?.url ?? image.url ?? null;
}

function windowOf(now: Date): { start: string; end: string } {
  const month = saoPauloToday(now).slice(0, 7);
  const endMonth = shiftMonth(month, 5);
  const end = daysInMonth(endMonth).at(-1) ?? `${endMonth}-28`;
  return { start: `${month}-01`, end };
}

async function fetchPage(url: string): Promise<TribePage | null> {
  const body = await fetchText(url);
  if (!body) return null;
  try {
    const data = JSON.parse(body) as TribePage;
    if (!data || !Array.isArray(data.events)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function loadCinemateca(now = new Date()): Promise<SourceResult> {
  const { start, end } = windowOf(now);
  const firstUrl = new URL(EVENTS_URL);
  firstUrl.searchParams.set("per_page", "50");
  firstUrl.searchParams.set("start_date", start);
  firstUrl.searchParams.set("end_date", end);
  firstUrl.searchParams.set("page", "1");

  const first = await fetchPage(firstUrl.toString());
  if (!first) return { items: [], warnings: ["A programação da Cinemateca não respondeu."] };

  const pages = [first];
  const totalPages = Math.min(first.total_pages ?? 1, 8);
  for (let page = 2; page <= totalPages; page += 1) {
    const url = new URL(firstUrl);
    url.searchParams.set("page", String(page));
    const next = await fetchPage(url.toString());
    if (!next) break;
    pages.push(next);
  }

  const seen = new Set<number>();
  const buckets = new Map<string, ProgramItem>();

  for (const page of pages) {
    for (const event of page.events ?? []) {
      if (event.id == null || seen.has(event.id)) continue;
      seen.add(event.id);
      const startAt = splitStamp(event.start_date);
      if (!startAt) continue;
      const endAt = splitStamp(event.end_date);
      const title = cleanText(event.title) ?? "Sessão sem título";
      const room = cleanText(event.venue?.venue ?? null);
      const key = `${normalize(title)}|${normalize(room ?? "")}`;
      const session: Session = {
        id: String(event.id),
        date: startAt.date,
        time: startAt.time === "00:00" ? "" : startAt.time,
        endTime: endAt && endAt.time !== startAt.time && endAt.time !== "00:00" ? endAt.time : null,
        webTickets: null,
        boxOfficeTickets: null,
        availability: "available",
        saleOpensAt: null,
        purchaseUrl: null,
        prices: null,
        priceLabel: null,
      };
      const tags = (event.categories ?? [])
        .map((category) => cleanText(category.name))
        .filter((tag): tag is string => Boolean(tag && tag !== "Sessão"));

      const existing = buckets.get(key);
      if (existing) {
        existing.sessions.push(session);
        if (!existing.image) existing.image = imageOf(event);
        continue;
      }

      buckets.set(key, {
        id: `cinemateca-${event.id}`,
        venue: "cinemateca",
        room,
        title,
        subtitle: null,
        image: imageOf(event),
        href: event.url || "https://cinemateca.org.br/programacao/",
        age: null,
        tags,
        kind: "screening",
        span: null,
        sessions: [session],
        online: false,
        watchUrl: null,
      });
    }
  }

  for (const item of buckets.values()) {
    item.sessions.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  }

  return { items: [...buckets.values()], warnings: [] };
}
