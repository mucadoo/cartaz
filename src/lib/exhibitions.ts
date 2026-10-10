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
  room?: string | null;
}): ProgramItem {
  return {
    id: options.id,
    venue: options.venue,
    room: options.room ?? null,
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

const MONTHS: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  fev: 2,
  fevereiro: 2,
  mar: 3,
  marco: 3,
  abr: 4,
  abril: 4,
  mai: 5,
  maio: 5,
  jun: 6,
  junho: 6,
  jul: 7,
  julho: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  setembro: 9,
  out: 10,
  outubro: 10,
  nov: 11,
  novembro: 11,
  dez: 12,
  dezembro: 12,
};

function monthNumber(name: string): number | null {
  const key = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return MONTHS[key] ?? null;
}

function fullYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function namedDay(day: string, monthName: string, year: string): string | null {
  const month = monthNumber(monthName);
  if (!month) return null;
  return iso(fullYear(Number(year)), month, Number(day));
}

function spanDays(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

const PINA_ROOMS: Record<string, string> = {
  "Edifício Pina Luz": "Pina Luz",
  "Edifício Pina Estação": "Pina Estação",
  "Edifício Pina Contemporânea": "Pina Contemporânea",
};

const PINA_URL = "https://pinacoteca.org.br/programacao/tipo/exposicoes/";
const MAM_URL = "https://mam.org.br/exposicoes/em-cartaz/";
const TOMIE_URL = "https://www.institutotomieohtake.org.br/programacao/exposicoes";
const CCBB_URL = "https://ccbb.com.br/sao-paulo/programacao/";
const AFRO_URL = "https://museuafrobrasil.org.br/exposicoes/";

export function parsePinacoteca(html: string, today: string): ProgramItem[] | null {
  if (!html.includes("card-programacao")) return null;
  const items: ProgramItem[] = [];
  const seen = new Set<string>();
  for (const block of html.split("card-programacao ").slice(1)) {
    const href = block.match(/href="(https:\/\/pinacoteca\.org\.br\/programacao\/exposicoes\/[^"#]+)"/)?.[1] ?? null;
    const room = PINA_ROOMS[decode(block.match(/Local: <\/span>([^<]+)/)?.[1] ?? "")];
    const title = decode(block.match(/<h3[\s\S]*?<\/h3>/)?.[0] ?? "").replace(/^Exposição:\s*/, "");
    if (!href || !room || !title || seen.has(href)) continue;
    const start = namedDayFromLine(block, "início");
    const end = namedDayFromLine(block, "término");
    if (!start || !end || end < today) continue;
    seen.add(href);
    const image = block.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
    items.push(
      exhibition({
        id: `pinacoteca-${href.split("/").filter(Boolean).pop()}`,
        venue: "pinacoteca",
        title,
        subtitle: decode(block.match(/class="resumo">([\s\S]*?)<\/p>/)?.[1] ?? "") || null,
        image,
        href,
        start,
        end,
        room,
      }),
    );
  }
  return items;
}

function namedDayFromLine(block: string, label: string): string | null {
  const line = decode(block.match(new RegExp(`<b>${label}</b>[^<]*<\\/p>`, "i"))?.[0] ?? "");
  const found = line.match(/(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{2,4})/);
  return found ? namedDay(found[1], found[2], found[3]) : null;
}

export function parseMam(html: string, today: string): ProgramItem[] | null {
  if (!html.includes("mam.org.br/exposicao/")) return null;
  const items: ProgramItem[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/href="(https:\/\/mam\.org\.br\/exposicao\/[^"#]+)"/g)) {
    const href = match[1].endsWith("/") ? match[1] : `${match[1]}/`;
    if (seen.has(href)) continue;
    const after = html.slice(match.index ?? 0, (match.index ?? 0) + 1200);
    const title = decode(after.match(/<h2 class="title">([\s\S]*?)<\/h2>/)?.[1] ?? "");
    const found = [...decode(after).matchAll(/(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{2,4})/g)];
    const start = found[0] ? namedDay(found[0][1], found[0][2], found[0][3]) : null;
    const end = found[1] ? namedDay(found[1][1], found[1][2], found[1][3]) : null;
    if (!title || !start || !end || end < today) continue;
    seen.add(href);
    const image = after.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
    items.push(exhibition({ id: `mam-${href.split("/").filter(Boolean).pop()}`, venue: "mam", title, subtitle: null, image, href, start, end }));
  }
  return items;
}

type TomieListing = { title: string; href: string; room: string | null };

export function parseTomieList(html: string): TomieListing[] | null {
  if (!html.includes("programme-item")) return null;
  const items: TomieListing[] = [];
  const seen = new Set<string>();
  for (const block of html.split('class="programme-item').slice(1)) {
    const infoAt = block.indexOf("programme-info");
    const text = decode(infoAt >= 0 ? block.slice(infoAt, infoAt + 1800) : block.slice(0, 1800));
    const found = text.match(
      /Exposição\s+(.+?)\s+(Instituto Tomie Ohtake|Casa-ateliê Tomie Ohtake(?:\s*\([^)]*\))?)\s+até\s+\d{1,2}\s+de\s+[A-Za-zÀ-ÿ]+/,
    );
    const href = block.match(/href="(https:\/\/www\.institutotomieohtake\.org\.br\/exposicoes\/[^"#]+)"/)?.[1] ?? null;
    if (!found || !href || seen.has(href)) continue;
    seen.add(href);
    items.push({
      title: found[1].trim(),
      href,
      room: found[2].startsWith("Casa-ateliê") ? "Casa-ateliê, Campo Belo" : null,
    });
  }
  return items;
}

export function parseTomieDetail(html: string): { start: string; end: string } | null {
  const text = decode(html);
  const found = text.match(/de\s+(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ]+)\s+a\s+(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ]+)\s+de\s+(\d{4})/i);
  if (!found) return null;
  const end = namedDay(found[3], found[4], found[5]);
  const endMonth = monthNumber(found[4]);
  const startMonth = monthNumber(found[2]);
  if (!end || !endMonth || !startMonth) return null;
  const endYear = Number(found[5]);
  const start = namedDay(found[1], found[2], String(startMonth > endMonth ? endYear - 1 : endYear));
  return start ? { start, end } : null;
}

export function parseCcbb(html: string, today: string): ProgramItem[] | null {
  if (!html.includes("ccbb.com.br/sao-paulo/programacao/")) return null;
  const items: ProgramItem[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/https:\/\/ccbb\.com\.br\/sao-paulo\/programacao\/([a-z0-9-]+)\//g)) {
    const slug = match[1];
    if (seen.has(slug)) continue;
    const window = html.slice(Math.max(0, (match.index ?? 0) - 2200), match.index ?? 0);
    const labels = [...window.matchAll(/>\s*(Exposição|Cinema|Teatro|Música|Eventos)\s*</g)];
    if (labels.at(-1)?.[1] !== "Exposição") continue;
    const dates = [...window.matchAll(/(\d{2})\/(\d{2})\/(\d{2})\s+a\s+(\d{2})\/(\d{2})\/(\d{2})/g)];
    const last = dates.at(-1);
    const title = decode([...window.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].at(-1)?.[1] ?? "");
    if (!last || !title) continue;
    const start = iso(fullYear(Number(last[3])), Number(last[2]), Number(last[1]));
    const end = iso(fullYear(Number(last[6])), Number(last[5]), Number(last[4]));
    if (!start || !end || end < today || spanDays(start, end) < 7) continue;
    seen.add(slug);
    const image = window.match(/background-image:\s*url\('([^']+)'\)/)?.[1] ?? null;
    items.push(
      exhibition({
        id: `ccbb-${slug}`,
        venue: "ccbb",
        title,
        subtitle: null,
        image,
        href: `https://ccbb.com.br/sao-paulo/programacao/${slug}/`,
        start,
        end,
      }),
    );
  }
  return items;
}

const AFRO_SKIP = new Set(["tour-virtual", "noite-de-aya-jantar-beneficente", "exposicao-de-longa-duracao"]);

export function parseAfroLinks(html: string): string[] | null {
  if (!html.includes("museuafrobrasil.org.br/exposicao/")) return null;
  const links: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/https:\/\/museuafrobrasil\.org\.br\/exposicao\/([a-z0-9-]+)\/?/g)) {
    const slug = match[1];
    if (AFRO_SKIP.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    links.push(`https://museuafrobrasil.org.br/exposicao/${slug}/`);
  }
  return links;
}

export function parseAfro(html: string, today: string): ProgramItem | null {
  const href = html.match(/property="og:url" content="([^"]+)"/)?.[1] ?? null;
  const title = decode(html.match(/property="og:title" content="([^"]+)"/)?.[1] ?? "").replace(/\s+-\s+Museu Afro Brasil.*$/i, "");
  const found = html.match(/(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/);
  if (!href || !title || !found || /jantar|tour virtual|longa dura/i.test(title)) return null;
  const start = iso(Number(found[3]), Number(found[2]), Number(found[1]));
  const end = iso(Number(found[6]), Number(found[5]), Number(found[4]));
  if (!start || !end || end < today || spanDays(start, end) < 7) return null;
  const slug = href.split("/").filter(Boolean).pop() ?? title;
  const image = html.match(/property="og:image" content="([^"]+)"/)?.[1] ?? null;
  return exhibition({ id: `afro-${slug}`, venue: "afro", title, subtitle: null, image, href, start, end });
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

export async function loadPinacoteca(now = new Date()): Promise<SourceResult> {
  const html = await fetchText(PINA_URL, HTML);
  if (!html) return { items: [], warnings: ["A programação da Pinacoteca não respondeu."] };
  const items = parsePinacoteca(html, saoPauloToday(now));
  if (!items) return { items: [], warnings: ["As exposições da Pinacoteca não puderam ser lidas."] };
  return { items, warnings: [] };
}

export async function loadMam(now = new Date()): Promise<SourceResult> {
  const html = await fetchText(MAM_URL, HTML);
  if (!html) return { items: [], warnings: ["A programação do MAM não respondeu."] };
  const items = parseMam(html, saoPauloToday(now));
  if (!items) return { items: [], warnings: ["As exposições do MAM não puderam ser lidas."] };
  return { items, warnings: [] };
}

export async function loadTomie(now = new Date()): Promise<SourceResult> {
  const html = await fetchText(TOMIE_URL, HTML);
  if (!html) return { items: [], warnings: ["A programação do Instituto Tomie Ohtake não respondeu."] };
  const listed = parseTomieList(html);
  if (!listed) return { items: [], warnings: ["As exposições do Instituto Tomie Ohtake não puderam ser lidas."] };
  const today = saoPauloToday(now);
  const details = await Promise.all(listed.map(async (show) => [show.href, await fetchText(show.href, HTML)] as const));
  const items: ProgramItem[] = [];
  for (const show of listed) {
    const page = details.find(([href]) => href === show.href)?.[1];
    const range = page ? parseTomieDetail(page) : null;
    if (!range || range.end < today) continue;
    const image = page?.match(/<img[^>]+src="(https:\/\/www\.institutotomieohtake\.org\.br\/wp-content\/[^"]+)"/)?.[1] ?? null;
    items.push(
      exhibition({
        id: `tomie-${show.href.split("/").filter(Boolean).pop()}`,
        venue: "tomie",
        title: show.title,
        subtitle: null,
        image,
        href: show.href,
        room: show.room,
        ...range,
      }),
    );
  }
  if (listed.length > 0 && items.length === 0) {
    return { items: [], warnings: ["As exposições do Instituto Tomie Ohtake não puderam ser lidas."] };
  }
  return { items, warnings: [] };
}

export async function loadCcbb(now = new Date()): Promise<SourceResult> {
  const html = await fetchText(CCBB_URL, HTML);
  if (!html) return { items: [], warnings: ["A programação do CCBB não respondeu."] };
  const items = parseCcbb(html, saoPauloToday(now));
  if (!items) return { items: [], warnings: ["As exposições do CCBB não puderam ser lidas."] };
  return { items, warnings: [] };
}

export async function loadAfro(now = new Date()): Promise<SourceResult> {
  const html = await fetchText(AFRO_URL, HTML);
  if (!html) return { items: [], warnings: ["A programação do Museu Afro Brasil não respondeu."] };
  const links = parseAfroLinks(html);
  if (!links) return { items: [], warnings: ["As exposições do Museu Afro Brasil não puderam ser lidas."] };
  const today = saoPauloToday(now);
  const pages = await Promise.all(links.map((href) => fetchText(href, HTML)));
  const items = pages.flatMap((page) => {
    const item = page ? parseAfro(page, today) : null;
    return item ? [item] : [];
  });
  if (links.length > 0 && items.length === 0 && pages.every((page) => !page)) {
    return { items: [], warnings: ["As exposições do Museu Afro Brasil não puderam ser lidas."] };
  }
  return { items, warnings: [] };
}
