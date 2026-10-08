import https from "node:https";
import tls from "node:tls";
import { RNP_ICPEDU_GR46 } from "@/lib/certs/rnp-icpedu-gr46";
import type { ProgramItem, Session } from "@/lib/types";

const HOME = "https://cinusp.webhostusp.sti.usp.br/";
const CA = [...tls.rootCertificates, RNP_ICPEDU_GR46];

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const SMALL = new Set(["de", "da", "do", "das", "dos", "e", "o", "a", "que", "para", "em", "na", "no"]);

type Screening = {
  title: string;
  href: string;
  date: string;
  time: string;
  room: string;
  image: string | null;
  subtitle: string | null;
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

function slug(value: string): string {
  return normalize(value).replace(/\s+/g, "-");
}

function clock(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})h(\d{2})?$/i);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2] ?? "00"}`;
}

function roomOf(raw: string): string {
  const key = normalize(raw);
  if (key.includes("maria")) return "Maria Antônia · Rua Maria Antônia, 294";
  if (key.includes("nova")) return "Nova Sala · Rua do Anfiteatro, 109";
  if (key.includes("favo")) return "Favo 04 · Rua do Anfiteatro, 181";
  return raw.trim();
}

function mostraOf(href: string): string | null {
  const match = href.match(/\/mostra\/\d{4}\/\d{2}\/([^/]+)/);
  if (!match) return null;
  const words = match[1].split("_").filter(Boolean);
  return words
    .map((word, index) => (index > 0 && SMALL.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function fetchPage(url: string, redirects = 0): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        ca: CA,
        headers: {
          Accept: "text/html",
          "User-Agent": "Cartaz/1.0 (calendario de programacao cultural)",
        },
        timeout: 20000,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location && redirects < 3) {
          res.resume();
          resolve(fetchPage(new URL(location, url).href, redirects + 1));
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function screeningsOf(html: string): Screening[] {
  const found: Screening[] = [];
  for (const block of html.split("show-for-medium-up").slice(1)) {
    const card = block.split("show-for-small-only")[0] ?? "";
    const titleMatch = card.match(/<h6><a href="([^"]+)">([\s\S]*?)<\/a><\/h6>/);
    const day = card.match(/<h3>\s*(\d{1,2})\s*<\/h3>\s*<h6>\s*([^<]+?)\s*<\/h6>/);
    const time = clock(cleanText(card.match(/<h4>([\s\S]*?)<\/h4>/)?.[1] ?? "") ?? "");
    const room = cleanText(card.match(/<em>([\s\S]*?)<\/em>\s*<\/a>/)?.[1] ?? null);
    if (!titleMatch || !day || !time || !room) continue;

    const href = new URL(titleMatch[1], HOME).href;
    const year = Number(href.match(/\/mostra\/(\d{4})\//)?.[1] ?? "");
    const month = MONTHS[normalize(day[2])] ?? 0;
    const dateDay = Number(day[1]);
    if (!year || !month || !dateDay) continue;

    const note = cleanText(card.match(/<span[^>]*>\s*<em>([\s\S]*?)<\/em>/)?.[1] ?? null);
    const image = card.match(/<img src="(https?:\/\/[^"]+)"/)?.[1] ?? null;
    found.push({
      title: cleanText(titleMatch[2]) ?? "Sessão",
      href,
      date: `${year}-${String(month).padStart(2, "0")}-${String(dateDay).padStart(2, "0")}`,
      time,
      room: roomOf(room),
      image,
      subtitle: note ?? mostraOf(href),
    });
  }
  return found;
}

function itemsFrom(screenings: Screening[]): ProgramItem[] {
  const groups = new Map<string, Screening[]>();
  for (const screening of screenings) {
    const key = `${slug(screening.title)}|${slug(screening.room)}`;
    groups.set(key, [...(groups.get(key) ?? []), screening]);
  }

  const items: ProgramItem[] = [];
  for (const [key, rows] of groups) {
    const first = rows[0];
    const sessions: Session[] = rows
      .map((row) => ({
        id: `cinusp-${key}-${row.date}-${row.time}`,
        date: row.date,
        time: row.time,
        endTime: null,
        webTickets: null,
        boxOfficeTickets: null,
        availability: "free" as const,
        saleOpensAt: null,
        purchaseUrl: null,
        prices: null,
        priceLabel: null,
      }))
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

    items.push({
      id: `cinusp-${key}`.slice(0, 90),
      venue: "cinusp",
      room: first.room,
      title: first.title,
      subtitle: first.subtitle,
      image: first.image,
      href: first.href,
      age: null,
      tags: [],
      kind: "screening",
      span: null,
      sessions,
      online: false,
      watchUrl: null,
    });
  }
  return items;
}

export async function loadCinusp(): Promise<{ items: ProgramItem[]; warnings: string[] }> {
  const html = await fetchPage(HOME);
  if (!html) return { items: [], warnings: ["A programação do CINUSP não respondeu."] };
  const items = itemsFrom(screeningsOf(html));
  if (/programa[cç][aã]o/i.test(html) && items.length === 0) {
    return { items: [], warnings: ["A programação do CINUSP não pôde ser lida."] };
  }
  return { items, warnings: [] };
}
