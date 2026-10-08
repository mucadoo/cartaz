import { fetchText } from "@/lib/http";
import type { Availability, ProgramItem, Session } from "@/lib/types";

const LISTING = "https://theatrosaopedro.art.br/programacao/";
const HTML = { Accept: "text/html" };

type ListingEvent = {
  id: string;
  title: string;
  href: string;
  date: string;
  image: string | null;
};

type Detail = {
  time: string;
  endTime: string | null;
  room: string | null;
  availability: Availability;
  priceLabel: string | null;
  age: string | null;
  purchaseUrl: string | null;
  image: string | null;
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&nbsp;|\u00a0/g, " ")
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

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function usefulImage(url: string | null | undefined): string | null {
  if (!url) return null;
  const absolute = url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
  if (/imagem-padrao|SITE\.png|theatro-sao-pedro-2|brasao|logo|favicon/i.test(absolute)) return null;
  return absolute;
}

function clock(value: string | null): string {
  if (!value) return "";
  const full = value.match(/(\d{1,2}):(\d{2})/);
  if (full) return `${full[1].padStart(2, "0")}:${full[2]}`;
  const short = value.match(/(\d{1,2})h(\d{2})?/i);
  if (!short) return "";
  return `${short[1].padStart(2, "0")}:${short[2] ?? "00"}`;
}

function addMinutes(time: string, minutes: number): string | null {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const hour = Math.floor(total / 60) % 24;
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function info(html: string, label: string): string | null {
  const pattern = new RegExp(`info-evento">${label}:</span>([\\s\\S]*?)</div>`);
  return cleanText(html.match(pattern)?.[1] ?? null);
}

function parseListing(html: string): ListingEvent[] {
  const events: ListingEvent[] = [];
  for (const block of html.split('<div class="evento ').slice(1)) {
    const head = block.slice(0, 1800);
    const date = head.match(/date-(\d{4}-\d{2}-\d{2})/)?.[1];
    const href = head.match(/href="(https:\/\/theatrosaopedro\.art\.br\/evento\?id=(\d+))"/)?.[1];
    const id = href?.match(/id=(\d+)/)?.[1];
    const title = cleanText(head.match(/class="_c000"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? null);
    if (!date || date.startsWith("1970") || !href || !id || !title) continue;
    events.push({
      id,
      title,
      href,
      date,
      image: usefulImage(head.match(/<img[^>]*src="([^"]+)"/)?.[1] ?? null),
    });
  }
  return events;
}

function parseDetail(html: string): Detail {
  const entrada = info(html, "Entrada") ?? "";
  const price = info(html, "Ingresso");
  const local = info(html, "Local");
  const time = clock(info(html, "Horário"));
  const minutes = Number(html.match(/Duração:<\/strong>\s*(\d+)/)?.[1] ?? "");
  const age = cleanText(html.match(/Classificação etária:<\/strong>\s*([^<]+)/)?.[1] ?? null);
  const cancelled = /cancelad/i.test(entrada);
  const free = /gratuit/i.test(entrada);
  const room = local && !normalize(local).includes("sao pedro") ? local : null;
  const purchase = html.match(/href="(https:\/\/theatrosaopedro\.byinti\.com[^"]*)"/)?.[1] ?? null;

  return {
    time,
    endTime: Number.isFinite(minutes) && minutes > 0 ? addMinutes(time, minutes) : null,
    room,
    availability: cancelled ? "cancelled" : free ? "free" : "available",
    priceLabel: free || !price || !/R\$/i.test(price) ? null : price,
    age,
    purchaseUrl: purchase ? decodeEntities(purchase) : null,
    image: usefulImage(html.match(/property="og:image" content="([^"]+)"/)?.[1] ?? null),
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

export async function loadSaoPedro(): Promise<{ items: ProgramItem[]; warnings: string[] }> {
  const html = await fetchText(LISTING, { headers: HTML });
  if (!html) return { items: [], warnings: ["A programação do Theatro São Pedro não respondeu."] };

  const events = parseListing(html);
  if (events.length === 0) return { items: [], warnings: ["A programação do Theatro São Pedro não trouxe eventos."] };

  const detailed = await mapPool(events, 6, async (event) => {
    const page = await fetchText(event.href, { headers: HTML });
    return { event, detail: page ? parseDetail(page) : null };
  });

  const buckets = new Map<string, ProgramItem>();
  for (const { event, detail } of detailed) {
    const availability = detail?.availability ?? "available";
    const session: Session = {
      id: event.id,
      date: event.date,
      time: detail?.time ?? "",
      endTime: detail?.endTime ?? null,
      webTickets: null,
      boxOfficeTickets: null,
      availability,
      saleOpensAt: null,
      purchaseUrl: availability === "cancelled" ? null : (detail?.purchaseUrl ?? null),
      prices: null,
      priceLabel: detail?.priceLabel ?? null,
    };
    const key = normalize(event.title);
    const existing = buckets.get(key);
    if (existing) {
      existing.sessions.push(session);
      if (!existing.image) existing.image = detail?.image ?? event.image;
      if (!existing.age && detail?.age) existing.age = detail.age;
      if (!existing.room && detail?.room) existing.room = detail.room;
      continue;
    }
    buckets.set(key, {
      id: `saopedro-${event.id}`,
      venue: "sao-pedro",
      room: detail?.room ?? null,
      title: event.title,
      subtitle: null,
      image: detail?.image ?? event.image,
      href: event.href,
      age: detail?.age ?? null,
      tags: [],
      kind: "screening",
      span: null,
      sessions: [session],
      online: false,
      watchUrl: null,
    });
  }

  for (const item of buckets.values()) {
    item.sessions.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  }

  return { items: [...buckets.values()], warnings: [] };
}
