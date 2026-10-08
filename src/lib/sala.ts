import { fetchText } from "@/lib/http";
import type { ProgramItem, Session } from "@/lib/types";

const LISTING = "https://salasaopaulo.art.br/salasp/pt/programacao-ingressos";
const ORIGIN = "https://salasaopaulo.art.br";

type SourceResult = { items: ProgramItem[]; warnings: string[] };

type Card = {
  concertId: string;
  href: string;
  title: string;
  series: string | null;
  image: string | null;
  room: string | null;
  age: string | null;
  date: string;
  time: string;
  endTime: string | null;
  free: boolean;
  priceLabel: string | null;
  purchaseUrl: string | null;
};

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

function field(card: string, label: string): string | null {
  const pattern = new RegExp(`${label}:[\\s\\S]{0,350}?<span[^>]*>([^<]+)`);
  return cleanText(card.match(pattern)?.[1] ?? null);
}

function spParts(isoUtc: string): { date: string; time: string } | null {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  const hour = pick("hour");
  const minute = pick("minute");
  if (!year || !month || !day) return null;
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

function addMinutes(time: string, minutes: number): string | null {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const hour = Math.floor(total / 60) % 24;
  const minute = ((total % 60) + 60) % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function imageOf(src: string | null): string | null {
  if (!src) return null;
  const decoded = decodeEntities(src);
  const href = decoded.match(/[?&]href=([^&]+)/)?.[1];
  if (href) {
    try {
      return decodeURIComponent(href);
    } catch {
      return href;
    }
  }
  if (decoded.startsWith("http")) return decoded;
  if (decoded.startsWith("/")) return `${ORIGIN}${decoded}`;
  return null;
}

function parseCard(card: string): Card | null {
  const iso = card.match(/datetime="([^"]+)"/)?.[1];
  const when = iso ? spParts(iso) : null;
  if (!when) return null;

  const titleLink = card.match(/<h3[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  const title = cleanText(titleLink?.[2] ?? null);
  if (!title) return null;

  const path = decodeEntities(titleLink?.[1] ?? "");
  const concertId = path.match(/\/concerto\/(\d+)/)?.[1] ?? `${when.date}-${title}`;
  const href = path.startsWith("http") ? path : `${ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
  const minutes = Number(field(card, "Duração")?.match(/(\d+)/)?.[1] ?? "");
  const price = field(card, "Valor");
  const free = Boolean(price && /gratuit/i.test(price));
  const ticket = card.match(/href="(https?:\/\/tickets\.oneboxtds\.com[^"]+)"/)?.[1];

  return {
    concertId,
    href,
    title,
    series: cleanText(card.match(/class="subheader[^"]*"[^>]*>([^<]*)/)?.[1] ?? null),
    image: imageOf(card.match(/<img[^>]*src="([^"]+)"/)?.[1] ?? null),
    room: cleanText(card.match(/Local:[\s\S]{0,400}?<a[^>]*>([^<]+)/)?.[1] ?? null),
    age: field(card, "Classificação indicativa"),
    date: when.date,
    time: when.time,
    endTime: Number.isFinite(minutes) && minutes > 0 ? addMinutes(when.time, minutes) : null,
    free,
    priceLabel: free ? null : price,
    purchaseUrl: ticket ? decodeEntities(ticket) : null,
  };
}

function parseListing(html: string): Card[] {
  return html
    .split('<div class="card"')
    .slice(1)
    .map(parseCard)
    .filter((card): card is Card => Boolean(card));
}

function toItems(cards: Card[]): ProgramItem[] {
  const buckets = new Map<string, ProgramItem>();
  for (const card of cards) {
    const session: Session = {
      id: `${card.concertId}-${card.date}-${card.time}`,
      date: card.date,
      time: card.time,
      endTime: card.endTime,
      webTickets: null,
      boxOfficeTickets: null,
      availability: card.free ? "free" : "available",
      saleOpensAt: null,
      purchaseUrl: card.purchaseUrl,
      prices: null,
      priceLabel: card.priceLabel,
    };
    const existing = buckets.get(card.concertId);
    if (existing) {
      if (!existing.sessions.some((item) => item.date === session.date && item.time === session.time)) {
        existing.sessions.push(session);
      }
      if (!existing.image && card.image) existing.image = card.image;
      continue;
    }
    buckets.set(card.concertId, {
      id: `sala-${card.concertId}`,
      venue: "sala-sp",
      room: card.room,
      title: card.title,
      subtitle: card.series,
      image: card.image,
      href: card.href,
      age: card.age,
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
  return [...buckets.values()];
}

export async function loadSala(): Promise<SourceResult> {
  const first = await fetchText(LISTING);
  if (!first) return { items: [], warnings: ["A programação da Sala São Paulo não respondeu."] };

  const pages = [first];
  const total = Math.min(Number(first.match(/aria-valuemax="(\d+)"/)?.[1] ?? "1"), 8);
  for (let page = 2; page <= total; page += 1) {
    const html = await fetchText(`${LISTING}?pageconcerts=${page}`);
    if (!html) break;
    pages.push(html);
  }

  return { items: toItems(pages.flatMap(parseListing)), warnings: [] };
}
