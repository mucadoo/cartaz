import { saoPauloToday } from "@/lib/dates";
import { fetchText } from "@/lib/http";
import type { ProgramItem, VenueId } from "@/lib/types";

const HTML = { headers: { Accept: "text/html" } };
const SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const MASP_URL = "https://masp.org.br/exposicoes";
const MIS_URL = "https://mis-sp.org.br/exposicao/";
const ITAU_URL = "https://www.itaucultural.org.br/agenda";

type SourceResult = { items: ProgramItem[]; warnings: string[] };

function decode(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, count: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, (date ?? 1) + count)).toISOString().slice(0, 10);
}

function shortDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${Number(date)} ${SHORT_MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

function rangeLabel(start: string, end: string, open: boolean): string {
  if (open) return `desde ${shortDay(start)}`;
  const [startYear, startMonth, startDate] = start.split("-");
  const [endYear, endMonth, endDate] = end.split("-");
  const startText = `${Number(startDate)} ${SHORT_MONTHS[Number(startMonth) - 1] ?? ""}`;
  const endText = `${Number(endDate)} ${SHORT_MONTHS[Number(endMonth) - 1] ?? ""}`;
  if (startYear === endYear) return `${startText} – ${endText} ${endYear}`;
  return `${startText} ${startYear} – ${endText} ${endYear}`;
}

function exhibition(options: {
  id: string;
  venue: VenueId;
  title: string;
  subtitle: string | null;
  image: string | null;
  href: string;
  start: string;
  end: string;
  open?: boolean;
}): ProgramItem {
  return {
    id: options.id,
    venue: options.venue,
    room: null,
    title: options.title,
    subtitle: options.subtitle,
    image: options.image,
    href: options.href,
    age: null,
    tags: ["Exposição"],
    kind: "span",
    span: {
      start: options.start,
      end: options.end,
      label: rangeLabel(options.start, options.end, options.open === true),
    },
    sessions: [],
    online: false,
    watchUrl: null,
  };
}

function parseDottedRange(value: string, today: string): { start: string; end: string; open: boolean } | null {
  const text = value.replace(/\s+/g, " ").trim();
  if (/desde/i.test(text)) return null;
  const full = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[—–-]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (full) {
    const start = iso(Number(full[3]), Number(full[2]), Number(full[1]));
    const end = iso(Number(full[6]), Number(full[5]), Number(full[4]));
    return start && end ? { start, end, open: false } : null;
  }
  const sharedYear = text.match(/^(\d{1,2})\.(\d{1,2})\s*[—–-]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (sharedYear) {
    const endYear = Number(sharedYear[5]);
    const endMonth = Number(sharedYear[4]);
    const startMonth = Number(sharedYear[2]);
    const start = iso(startMonth > endMonth ? endYear - 1 : endYear, startMonth, Number(sharedYear[1]));
    const end = iso(endYear, endMonth, Number(sharedYear[3]));
    return start && end ? { start, end, open: false } : null;
  }
  const single = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (single) {
    const start = iso(Number(single[3]), Number(single[2]), Number(single[1]));
    if (!start) return null;
    return { start, end: addDays(start > today ? start : today, 120), open: true };
  }
  return null;
}

export function parseMasp(html: string, today: string): ProgramItem[] | null {
  const start = html.indexOf('id="em-cartaz"');
  const end = html.indexOf('id="em-breve"', start + 1);
  if (start < 0 || end < 0) return null;
  const chunk = html.slice(start, end);
  const items: ProgramItem[] = [];
  const seen = new Set<string>();
  for (const block of chunk.split("box-image-text-toggle").slice(1)) {
    const title = decode(block.match(/<h3 class="title">([\s\S]*?)<\/h3>/)?.[1] ?? "");
    const dates = decode(block.match(/<h5 class="sub-title">([\s\S]*?)<\/h5>/)?.[1] ?? "");
    const href = block.match(/href="(https:\/\/masp\.org\.br\/exposicoes\/[^"#]+)"/)?.[1] ?? null;
    if (!title || !href || seen.has(href)) continue;
    const range = parseDottedRange(dates, today);
    if (!range || range.end < today) continue;
    seen.add(href);
    const image = block.match(/background-image:\s*url\(([^)]+)\)/)?.[1]?.replace(/['"]/g, "") ?? null;
    items.push(
      exhibition({
        id: `masp-${href.split("/").pop()}`,
        venue: "masp",
        title,
        subtitle: null,
        image,
        href,
        ...range,
      }),
    );
  }
  return items;
}

export function parseMis(html: string, today: string): ProgramItem[] | null {
  if (!html.includes("mio-exhibition-date")) return null;
  const items: ProgramItem[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)) {
    const block = match[1];
    const title = decode(block.match(/mio-post-title">([\s\S]*?)<\/h2>/)?.[1] ?? "");
    const dates = decode(block.match(/mio-exhibition-date">([\s\S]*?)<\/p>/)?.[1] ?? "");
    const href = block.match(/href="(https:\/\/mis-sp\.org\.br\/exposicao\/[^"]+)"/)?.[1] ?? null;
    const found = dates.match(/(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/);
    if (!title || !href || !found || seen.has(href)) continue;
    const start = iso(Number(found[3]), Number(found[2]), Number(found[1]));
    const end = iso(Number(found[6]), Number(found[5]), Number(found[4]));
    if (!start || !end || end < today) continue;
    seen.add(href);
    const image = block.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
    items.push(exhibition({ id: `mis-${href.split("/").filter(Boolean).pop()}`, venue: "mis", title, subtitle: null, image, href, start, end }));
  }
  return items;
}

type ItauSchedule = {
  title?: string;
  shortDescription?: string;
  slug?: string;
  image?: string;
  exhibition?: boolean;
  startDate?: string;
  endDate?: string;
  soldOut?: boolean;
};

export function parseItau(html: string, today: string): ProgramItem[] | null {
  const raw = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!raw) return null;
  let schedules: ItauSchedule[] = [];
  try {
    const data = JSON.parse(raw) as { props?: { pageProps?: { schedules?: ItauSchedule[] } } };
    schedules = data.props?.pageProps?.schedules ?? [];
  } catch {
    return null;
  }
  const items: ProgramItem[] = [];
  for (const show of schedules) {
    const title = show.title?.trim();
    const slug = show.slug?.trim();
    const start = show.startDate?.slice(0, 10);
    const end = (show.endDate || show.startDate)?.slice(0, 10);
    if (!title || !slug || !start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
    if (end < today || end <= start) continue;
    const ocupacao = /\bocupa[cç][aã]o\b/i.test(title) && !/cinema/i.test(title);
    const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
    if (!show.exhibition && !(ocupacao && days >= 14)) continue;
    if (show.exhibition && /cinema/i.test(title)) continue;
    items.push(
      exhibition({
        id: `itau-${slug}`,
        venue: "itau",
        title,
        subtitle: show.soldOut ? "Esgotado" : show.shortDescription?.trim() || null,
        image: show.image || null,
        href: `https://www.itaucultural.org.br/secoes/agenda/${slug}`,
        start,
        end,
      }),
    );
  }
  return items;
}

export async function loadMasp(now = new Date()): Promise<SourceResult> {
  const html = await fetchText(MASP_URL, HTML);
  if (!html) return { items: [], warnings: ["A programação do MASP não respondeu."] };
  const items = parseMasp(html, saoPauloToday(now));
  if (!items) return { items: [], warnings: ["As exposições do MASP não puderam ser lidas."] };
  return { items, warnings: [] };
}

export async function loadMis(now = new Date()): Promise<SourceResult> {
  const html = await fetchText(MIS_URL, HTML);
  if (!html) return { items: [], warnings: ["A programação do MIS não respondeu."] };
  const items = parseMis(html, saoPauloToday(now));
  if (!items) return { items: [], warnings: ["As exposições do MIS não puderam ser lidas."] };
  return { items, warnings: [] };
}

export async function loadItau(now = new Date()): Promise<SourceResult> {
  const html = await fetchText(ITAU_URL, HTML);
  if (!html) return { items: [], warnings: ["A programação do Itaú Cultural não respondeu."] };
  const items = parseItau(html, saoPauloToday(now));
  if (!items) return { items: [], warnings: ["As exposições do Itaú Cultural não puderam ser lidas."] };
  return { items, warnings: [] };
}
