import { fetchText } from "@/lib/http";
import type { Availability, ProgramItem, Session } from "@/lib/types";

const LISTING = "https://theatromunicipal.org.br/programacao/";

const MONTHS = [
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
];

type ListingNav = {
  query?: Record<string, unknown>;
  widget_settings?: Record<string, unknown>;
};

type Card = {
  id: string;
  title: string;
  href: string;
  category: string | null;
  room: string | null;
  image: string | null;
  start: string;
  end: string;
  availability: Availability;
};

type Slot = { date: string; time: string };

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(value: string | null | undefined): string | null {
  const text = decodeEntities(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text : null;
}

function brDate(value: string | null): string | null {
  const match = value?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function longDate(value: string): string | null {
  const match = value.match(/(\d{1,2}) de ([a-zç]+) de (\d{4})/i);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2].toLowerCase()) + 1;
  if (month <= 0) return null;
  return `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function clock(value: string): string | null {
  const full = value.match(/^(\d{2}):(\d{2})$/);
  if (full) return `${full[1]}:${full[2]}`;
  const short = value.match(/^(\d{1,2})h(\d{2})?$/i);
  if (!short) return null;
  return `${short[1].padStart(2, "0")}:${short[2] ?? "00"}`;
}

function labelDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function field(card: string, className: string): string | null {
  const pattern = new RegExp(`${className}[\\s\\S]{0,700}?jet-listing-dynamic-field__content"\\s*>([\\s\\S]*?)</div>`);
  return cleanText(card.match(pattern)?.[1] ?? null);
}

function encodeForm(payload: Record<string, unknown>): string {
  const fields: [string, string][] = [];
  const walk = (prefix: string, value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(`${prefix}[${index}]`, item));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        walk(`${prefix}[${key}]`, item);
      }
      return;
    }
    if (typeof value === "boolean") {
      fields.push([prefix, value ? "true" : "false"]);
      return;
    }
    fields.push([prefix, value == null ? "" : String(value)]);
  };
  for (const [key, value] of Object.entries(payload)) walk(key, value);
  return new URLSearchParams(fields).toString();
}

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  for (const part of html.split("jet-listing-grid__item").slice(1)) {
    if (!part.includes("card-evento")) continue;
    const titleLink = part.match(/<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const title = cleanText(titleLink?.[2] ?? null);
    const start = brDate(field(part, "evento-data-inicial"));
    const end = brDate(field(part, "evento-data-final")) ?? start;
    if (!title || !start || !end) continue;

    const id = part.match(/data-post-id="(\d+)"/)?.[1] ?? part.match(/dynamic-post-(\d+)/)?.[1] ?? start + title;
    const badge = cleanText(part.match(/elementor-button-text">([\s\S]*?)<\/span>/)?.[1] ?? null);
    const place = cleanText(part.match(/elementor-icon-list-text">([\s\S]*?)<\/span>/)?.[1] ?? null);
    const image = cleanText(part.match(/background-image:\s*url\(([^)]+)\)/)?.[1] ?? null)?.replace(/^["']|["']$/g, "") ?? null;
    const cancelled = /cancelad/i.test(`${title} ${badge ?? ""}`);
    const free = /gratuit/i.test(badge ?? "");

    cards.push({
      id,
      title,
      href: titleLink?.[1] ?? LISTING,
      category: cleanText(part.match(/categorias-eventos\/[^"]+">([^<]+)/)?.[1] ?? null),
      room: place && !/^outros$/i.test(place) ? place : null,
      image,
      start,
      end,
      availability: cancelled ? "cancelled" : free ? "free" : "available",
    });
  }
  return cards;
}

function performances(html: string): Slot[] {
  const contents = [...html.matchAll(/jet-listing-dynamic-field__content"\s*>([\s\S]*?)<\/div>/g)]
    .map((match) => cleanText(match[1]))
    .filter((value): value is string => Boolean(value));
  const slots: Slot[] = [];
  for (let index = 0; index < contents.length; index += 1) {
    const date = longDate(contents[index]);
    if (!date) continue;
    const time = clock(contents[index + 1] ?? "");
    if (time) index += 1;
    slots.push({ date, time: time ?? "" });
  }
  return slots;
}

function ticketUrl(html: string): string | null {
  const href = html.match(/href="(https:\/\/theatromunicipalsp\.byinti\.com[^"]*)"/)?.[1];
  return href ? decodeEntities(href) : null;
}

function sessionsFor(card: Card, slots: Slot[], purchaseUrl: string | null): Session[] {
  const unique = new Map<string, Slot>();
  for (const slot of slots) unique.set(`${slot.date}T${slot.time}`, slot);
  const list = [...unique.values()];
  if (list.length === 0 && card.start === card.end) list.push({ date: card.start, time: "" });

  return list
    .map((slot) => ({
      id: `${card.id}-${slot.date}-${slot.time || "dia"}`,
      date: slot.date,
      time: slot.time,
      endTime: null,
      webTickets: null,
      boxOfficeTickets: null,
      availability: card.availability,
      saleOpensAt: null,
      purchaseUrl: card.availability === "cancelled" ? null : purchaseUrl,
      prices: null,
      priceLabel: null,
    }))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

function toItem(card: Card, slots: Slot[], purchaseUrl: string | null): ProgramItem {
  const sessions = sessionsFor(card, slots, purchaseUrl);
  const span =
    sessions.length === 0
      ? { start: card.start, end: card.end, label: `${labelDate(card.start)} a ${labelDate(card.end)}` }
      : null;

  return {
    id: `municipal-${card.id}`,
    venue: "municipal",
    room: card.room,
    title: card.title,
    subtitle: card.category,
    image: card.image,
    href: card.href,
    age: null,
    tags: [],
    kind: span ? "span" : "screening",
    span,
    sessions,
    online: false,
    watchUrl: null,
  };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function listingNav(html: string): { nav: ListingNav; pages: number } | null {
  const raw = html.match(/data-nav="([^"]+)"/)?.[1];
  if (!raw) return null;
  try {
    const nav = JSON.parse(decodeEntities(raw)) as ListingNav;
    const pages = Math.min(Number(html.match(/data-pages="(\d+)"/)?.[1] ?? "1"), 6);
    return { nav, pages: Number.isFinite(pages) ? pages : 1 };
  } catch {
    return null;
  }
}

async function loadMore(nav: ListingNav, page: number): Promise<string | null> {
  const body = encodeForm({
    action: "jet_engine_ajax",
    handler: "listing_load_more",
    query: nav.query ?? {},
    widget_settings: nav.widget_settings ?? {},
    page_settings: { post_id: "415", queried_id: "415", element_id: "q1", page: String(page) },
    listing_type: "elementor",
    isEditMode: "false",
  });
  const text = await fetchText(`${LISTING}?nocache=1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Referer: LISTING,
    },
    body,
  });
  if (!text) return null;
  try {
    const data = JSON.parse(text) as { success?: boolean; data?: { html?: string } };
    if (!data.success) return null;
    return data.data?.html ?? "";
  } catch {
    return null;
  }
}

export async function loadMunicipal(): Promise<{ items: ProgramItem[]; warnings: string[] }> {
  const htmlHeaders = { Accept: "text/html" };
  const first = await fetchText(LISTING, { headers: htmlHeaders });
  if (!first) return { items: [], warnings: ["A programação do Theatro Municipal não respondeu."] };

  const pages = [first];
  const listing = listingNav(first);
  if (listing) {
    for (let page = 2; page <= listing.pages; page += 1) {
      const html = await loadMore(listing.nav, page);
      if (!html) break;
      pages.push(html);
    }
  }

  const seen = new Set<string>();
  const cards = pages.flatMap(parseCards).filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });

  const items = await mapPool(cards, 6, async (card) => {
    const html = await fetchText(card.href, { headers: htmlHeaders });
    const slots = html ? performances(html) : [];
    return toItem(card, slots, html ? ticketUrl(html) : null);
  });

  return { items, warnings: [] };
}
