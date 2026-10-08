import { saoPauloToday } from "@/lib/dates";
import { fetchText } from "@/lib/http";
import type { ProgramItem, Session } from "@/lib/types";

const PAGE = "https://baccarelli.org.br/nucleos/teatro-baccarelli/";

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

function shiftDays(iso: string, delta: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + delta));
  return date.toISOString().slice(0, 10);
}

function eventDate(label: string, today: string): string | null {
  const match = label.match(/(\d{1,2}) de ([a-zç]+)/i);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2].toLowerCase()) + 1;
  if (month <= 0) return null;
  const year = Number(today.slice(0, 4));
  const iso = (value: number) =>
    `${value}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const current = iso(year);
  if (current >= shiftDays(today, -2)) return current;
  return iso(year + 1);
}

function timesOf(label: string): string[] {
  const times = [...label.matchAll(/(?:^|[^\d])(\d{1,2})h(\d{2})?(?!\d)/gi)].map((match) => {
    const hour = match[1].padStart(2, "0");
    const minute = match[2] ?? "00";
    return `${hour}:${minute}`;
  });
  return times.length ? times : [""];
}

function slugOf(href: string, title: string, date: string): string {
  const slug = href.match(/#\/event\/([^/?#]+)/)?.[1];
  const base = slug ?? title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `${base}-${date}`;
}

export async function loadBaccarelli(now = new Date()): Promise<{ items: ProgramItem[]; warnings: string[] }> {
  const html = await fetchText(PAGE, { headers: { Accept: "text/html" } });
  if (!html) return { items: [], warnings: ["A programação do Teatro Baccarelli não respondeu."] };

  const today = saoPauloToday(now);
  const start = html.indexOf('id="em-cartaz"');
  if (start < 0) return { items: [], warnings: ["A programação do Teatro Baccarelli não trouxe eventos."] };
  const section = html.slice(start);
  const items: ProgramItem[] = [];

  for (const match of section.matchAll(/<a\b[^>]*class="theater-event-box"[^>]*>[\s\S]*?<\/a>/g)) {
    const block = match[0];
    const href = decodeEntities(block.match(/href="([^"]+)"/)?.[1] ?? PAGE);
    const title = cleanText(block.match(/class="title-03">([\s\S]*?)<\/h3>/)?.[1] ?? null);
    const dateLabel = cleanText(block.match(/<div class="wp-block">\s*<h3>([\s\S]*?)<\/h3>/)?.[1] ?? null);
    const when = cleanText(block.match(/<div class="wp-block">[\s\S]*?<p>([\s\S]*?)<\/p>/)?.[1] ?? null);
    const image = block.match(/<img[^>]*src="([^"]+)"/)?.[1] ?? null;
    const date = dateLabel ? eventDate(dateLabel, today) : null;
    if (!title || !date) continue;

    const free = /gratuito/i.test(`${image ?? ""} ${block.match(/alt="([^"]*)"/)?.[1] ?? ""}`);
    const sessions: Session[] = timesOf(when ?? "").map((time) => ({
      id: `${slugOf(href, title, date)}-${time || "dia"}`,
      date,
      time,
      endTime: null,
      webTickets: null,
      boxOfficeTickets: null,
      availability: free ? "free" : "available",
      saleOpensAt: null,
      purchaseUrl: href,
      prices: null,
      priceLabel: null,
    }));

    items.push({
      id: `baccarelli-${slugOf(href, title, date)}`,
      venue: "baccarelli",
      room: null,
      title,
      subtitle: null,
      image,
      href,
      age: null,
      tags: [],
      kind: "screening",
      span: null,
      sessions,
      online: false,
      watchUrl: null,
    });
  }

  return { items, warnings: items.length ? [] : ["A programação do Teatro Baccarelli não trouxe eventos."] };
}
