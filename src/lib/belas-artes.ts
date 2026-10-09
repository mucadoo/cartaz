import { MONTHS, saoPauloToday } from "@/lib/dates";
import { fetchText } from "@/lib/http";
import type { Availability, ProgramItem, Session } from "@/lib/types";

const REGULAR = "https://www.cinebelasartes.com.br/programacao-regular/";
const SPECIAL = "https://www.cinebelasartes.com.br/programacao-especial/";
const HTML = { Accept: "text/html" };
const RELAY = "https://r.jina.ai/";

let relayOnly = false;

async function fetchHtml(url: string): Promise<string | null> {
  if (!relayOnly) {
    const direct = await fetchText(url, { headers: HTML });
    if (direct) return direct;
    relayOnly = true;
  }
  return fetchText(`${RELAY}${url}`, { headers: { ...HTML, "X-Return-Format": "html" } });
}

type Card = {
  title: string;
  href: string;
  when: string;
  image: string | null;
};

type DatedFilm = {
  title: string;
  date: string;
  minutes: number | null;
  age: string | null;
  purchaseUrl: string | null;
};

type NightFilm = DatedFilm & { time: string; room: string | null };

type ServiceInfo = {
  dates: string[];
  times: string[];
  rangeEnd: string | null;
  room: string | null;
  rooms: Map<string, string>;
  priceLabel: string | null;
  free: boolean;
  minutes: number | null;
  age: string | null;
  links: TicketLink[];
};

type TicketLink = { url: string; time: string | null; roomKey: string | null };

type DigestEvent = {
  title: string;
  href: string | null;
  purchaseUrl: string | null;
  horario: string;
  priceLabel: string | null;
  free: boolean;
  age: string | null;
  minutes: number | null;
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

function toText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|h\d|div|li)>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n");
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

function clock(hour: string, minute?: string): string {
  return `${hour.padStart(2, "0")}:${(minute ?? "00").padStart(2, "0")}`;
}

function addMinutes(time: string, minutes: number): string | null {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

function shiftDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function isoDate(day: number, month: number, today: string): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const [year, todayMonth, todayDay] = today.split("-").map(Number);
  let resolved = year;
  const diff = (Date.UTC(resolved, month - 1, day) - Date.UTC(year, todayMonth - 1, todayDay)) / 86_400_000;
  if (diff < -45) resolved += 1;
  else if (diff > 320) resolved -= 1;
  return `${resolved}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthNumber(name: string): number | null {
  const key = normalize(name);
  const index = MONTHS.findIndex((month) => normalize(month) === key);
  return index >= 0 ? index + 1 : null;
}

function rangeFrom(phrase: string, today: string): { start: string; end: string } | null {
  const full = phrase.match(/(\d{1,2})[./](\d{1,2})\s*a\s*(\d{1,2})[./](\d{1,2})/i);
  if (full) {
    const start = isoDate(Number(full[1]), Number(full[2]), today);
    const end = isoDate(Number(full[3]), Number(full[4]), today);
    if (start && end) return start <= end ? { start, end } : { start: end, end: start };
  }
  const sameMonth = phrase.match(/(\d{1,2})\s*a\s*(\d{1,2})[./](\d{1,2})/i);
  if (sameMonth) {
    const month = Number(sameMonth[3]);
    const start = isoDate(Number(sameMonth[1]), month, today);
    const end = isoDate(Number(sameMonth[2]), month, today);
    if (start && end) return start <= end ? { start, end } : { start: end, end: start };
  }
  return null;
}

function datesFromPhrase(phrase: string, today: string): string[] {
  const named = phrase.match(/de\s+([A-Za-zÀ-ú]+)/);
  if (named) {
    const month = monthNumber(named[1]);
    if (!month) return [];
    return [...phrase.matchAll(/\d{1,2}/g)]
      .map((match) => isoDate(Number(match[0]), month, today))
      .filter((date): date is string => Boolean(date));
  }
  return [...phrase.matchAll(/(\d{1,2})[./](\d{1,2})/g)]
    .map((match) => isoDate(Number(match[1]), Number(match[2]), today))
    .filter((date): date is string => Boolean(date));
}

function readTimes(phrase: string): { times: string[]; endTime: string | null } {
  const range = phrase.match(/(\d{1,2})h(\d{2})?\s*(?:às|as)\s*(\d{1,2})h(\d{2})?/i);
  if (range) return { times: [clock(range[1], range[2])], endTime: clock(range[3], range[4]) };
  const times = [...phrase.matchAll(/(\d{1,2})h(\d{2})?/gi)].map((match) => clock(match[1], match[2]));
  return { times, endTime: null };
}

function priceFrom(phrase: string): { priceLabel: string | null; free: boolean } {
  if (/gratuit/i.test(phrase)) return { priceLabel: null, free: true };
  const amount = (kind: string) => phrase.match(new RegExp(`R\\$\\s*([\\d.]+(?:,\\d{2})?)\\s*\\(${kind}`, "i"))?.[1] ?? null;
  const full = amount("inteira");
  const half = amount("meia");
  if (half && full) return { priceLabel: `R$${half} (meia-entrada) a R$${full} (inteira)`, free: false };
  if (full) return { priceLabel: `R$${full} (inteira)`, free: false };
  if (half) return { priceLabel: `R$${half} (meia-entrada)`, free: false };
  return { priceLabel: null, free: false };
}

function regularPrice(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (day === 1) return "R$10,00 (meia-entrada) a R$20,00 (inteira)";
  if (day === 2 || day === 3) return "R$17,00 (meia-entrada) a R$34,00 (inteira)";
  return "R$20,00 (meia-entrada) a R$40,00 (inteira)";
}

function labeled(text: string, label: string): string | null {
  const match = text.match(new RegExp(`(?:^|\\n)\\s*${label}s?:\\s*([^\\n]+)`, "i"));
  return cleanText(match?.[1] ?? null);
}

function mainHtml(html: string): string {
  const start = html.lastIndexOf("c-play-schedule__title");
  if (start < 0) return "";
  const end = html.indexOf('class="c-footer', start);
  return html.slice(start, end < 0 ? undefined : end);
}

function ticketLinks(html: string): TicketLink[] {
  const links: TicketLink[] = [];
  for (const match of html.matchAll(/href="(https:\/\/www\.veloxtickets\.com[^"]+)"([\s\S]*?)<\/a>/gi)) {
    const label = cleanText(match[2]) ?? "";
    const time = label.match(/(\d{1,2})h(\d{2})?/i);
    const room = label.match(/sala\s*\d+/i)?.[0].toLowerCase().replace(/\s+/g, " ") ?? null;
    links.push({ url: decodeEntities(match[1]), time: time ? clock(time[1], time[2]) : null, roomKey: room });
  }
  return links;
}

function purchaseFor(links: TicketLink[], time: string, room: string | null): string | null {
  const roomKey = room?.match(/sala\s*\d+/i)?.[0].toLowerCase().replace(/\s+/g, " ") ?? null;
  return (
    links.find((link) => link.time && link.time === time)?.url ??
    (roomKey ? links.find((link) => link.roomKey === roomKey)?.url : null) ??
    links.find((link) => !link.time && !link.roomKey)?.url ??
    links[0]?.url ??
    null
  );
}

function roomDirectory(local: string): Map<string, string> {
  const rooms = new Map<string, string>();
  for (const part of local.split("/")) {
    const label = cleanText(part.replace(/^[^|]*\|/, ""));
    const key = label?.match(/sala\s*\d+/i)?.[0].toLowerCase().replace(/\s+/g, " ");
    if (label && key) rooms.set(key, label.replace(/\s+/g, " ").trim());
  }
  return rooms;
}

function minutesOf(text: string): number | null {
  const minutes = Number(text.match(/(\d+)\s*min/i)?.[1] ?? "");
  return Number.isFinite(minutes) && minutes > 0 && minutes < 400 ? minutes : null;
}

function ageOf(text: string): string | null {
  const match = text.match(/\b(\d+\s*anos|livre)\b/i);
  if (!match) return null;
  return /^\d/.test(match[1]) ? match[1].replace(/\s+/g, " ") : "Livre";
}

function formatRange(start: string, end: string): string {
  const [, startMonth, startDay] = start.split("-");
  const [, endMonth, endDay] = end.split("-");
  const startName = MONTHS[Number(startMonth) - 1] ?? startMonth;
  const endName = MONTHS[Number(endMonth) - 1] ?? endMonth;
  if (startMonth === endMonth) return `${Number(startDay)} a ${Number(endDay)} de ${startName}`;
  return `${Number(startDay)} de ${startName} a ${Number(endDay)} de ${endName}`;
}

function takeId(title: string, room: string | null, used: Set<string>): string {
  const base = `belas-${slug(title)}${room ? `-${slug(room)}` : ""}`.slice(0, 90);
  let id = base || "belas-evento";
  let count = 2;
  while (used.has(id)) {
    id = `${base}-${count}`;
    count += 1;
  }
  used.add(id);
  return id;
}

function screening(fields: {
  id: string;
  title: string;
  subtitle: string | null;
  room: string | null;
  image: string | null;
  href: string;
  age: string | null;
  tags: string[];
  sessions: Session[];
}): ProgramItem {
  return {
    ...fields,
    venue: "belas-artes",
    kind: "screening",
    span: null,
    online: false,
    watchUrl: null,
  };
}

function makeSession(
  id: string,
  date: string,
  time: string,
  endTime: string | null,
  availability: Availability,
  purchaseUrl: string | null,
  priceLabel: string | null,
): Session {
  return {
    id,
    date,
    time,
    endTime,
    webTickets: null,
    boxOfficeTickets: null,
    availability,
    saleOpensAt: null,
    purchaseUrl: availability === "free" ? null : purchaseUrl,
    prices: null,
    priceLabel: availability === "free" ? null : priceLabel,
  };
}

function withSessions(
  id: string,
  dates: string[],
  times: string[],
  fixedEnd: string | null,
  minutes: number | null,
  availability: Availability,
  purchaseUrl: string | null,
  priceLabel: string | null,
  priceForDate?: (date: string) => string,
  purchaseForTime?: (time: string) => string | null,
): Session[] {
  const clocks = times.length > 0 ? times : [""];
  const sessions: Session[] = [];
  for (const date of dates) {
    for (const time of clocks) {
      const endTime = fixedEnd ?? (time && minutes ? addMinutes(time, minutes) : null);
      const label = priceForDate ? priceForDate(date) : priceLabel;
      const purchase = purchaseForTime ? purchaseForTime(time) : purchaseUrl;
      sessions.push(makeSession(`${id}-${date}-${time || "dia"}`, date, time, endTime, availability, purchase, label));
    }
  }
  sessions.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  return sessions;
}

function parseRegular(html: string, today: string, used: Set<string>): ProgramItem[] {
  const items: ProgramItem[] = [];
  for (const block of html.split('<div class="c-movie-card">').slice(1)) {
    const title = cleanText(block.match(/c-movie-card__info-title">([\s\S]*?)<\/h3>/)?.[1] ?? null);
    if (!title || !normalize(title).includes("relancamento")) continue;
    const href = cleanText(block.match(/href="([^"]+)"/)?.[1] ?? null);
    if (!href) continue;
    const room = cleanText(block.match(/c-movie-card__info-room">([^<]+)/)?.[1] ?? null)?.split("|")[0]?.trim() || null;
    const image = block.match(/c-movie-card__thumb" src="([^"]+)"/)?.[1] ?? null;
    const parts = (cleanText(block.match(/c-movie-card__info-comp">([^<]+)/)?.[1] ?? null) ?? "")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    const age = parts.find((part) => /^\d+\s*anos$/i.test(part) || /^livre$/i.test(part)) ?? null;
    const minutes = Number(parts.join(" ").match(/(\d+)\s*min/i)?.[1] ?? "");
    const genre = parts.find((part) => part !== age && !/min|anos/i.test(part)) ?? null;
    const director = parts.length >= 5 ? parts[4] : null;
    const table = block.match(/<table class="c-movie__info-times-table">([\s\S]*?)<\/table>/)?.[1] ?? "";
    const dates = [...table.matchAll(/<th[\s\S]*?(\d{2})\/(\d{2})/g)]
      .map((match) => isoDate(Number(match[1]), Number(match[2]), today))
      .filter((date): date is string => Boolean(date));
    const cells = [...table.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
    const id = takeId(title, room, used);
    const sessions: Session[] = [];
    dates.forEach((date, index) => {
      const times = [...(cells[index] ?? "").matchAll(/(\d{1,2})h(\d{2})/g)].map((match) => clock(match[1], match[2]));
      if (times.length === 0) return;
      sessions.push(
        ...withSessions(id, [date], times, null, Number.isFinite(minutes) ? minutes : null, "available", null, null, regularPrice),
      );
    });
    if (sessions.length === 0) continue;
    items.push(
      screening({
        id,
        title,
        subtitle: director ? `Direção: ${director}` : null,
        room,
        image,
        href,
        age: age ? age.replace(/\s+/g, " ") : null,
        tags: genre ? [genre] : [],
        sessions,
      }),
    );
  }
  return items;
}

function parseSpecialCards(html: string): Card[] {
  const cards: Card[] = [];
  const seen = new Set<string>();
  for (const block of html.split('<div class="c-movie-card">').slice(1)) {
    const href = cleanText(block.match(/href="([^"]+)"/)?.[1] ?? null);
    const title = cleanText(block.match(/c-movie-card__info-title">([\s\S]*?)<\/h3>/)?.[1] ?? null);
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    cards.push({
      title,
      href,
      when: cleanText(block.match(/c-movie-card__info-subtitle">([\s\S]*?)<\/h4>/)?.[1] ?? null) ?? "",
      image: block.match(/c-movie-card__thumb" src="([^"]+)"/)?.[1] ?? null,
    });
  }
  return cards;
}

function readService(serviceHtml: string, pageHtml: string, today: string): ServiceInfo {
  const text = toText(serviceHtml);
  const page = toText(pageHtml);
  const dataLine = labeled(text, "Data") ?? "";
  const range = rangeFrom(dataLine, today);
  const times = readTimes(labeled(text, "Horário") ?? "");
  const local = labeled(text, "Local") ?? "";
  const price = priceFrom(labeled(text, "Ingressos") ?? "");
  const rooms = roomDirectory(local);
  const onlyRoom = rooms.size === 1 ? [...rooms.values()][0] : null;
  const duration = page.match(/Dura[cç][aã]o:\s*(\d+)\s*min/i);
  const rating = page.match(/Classifica[cç][aã]o:\s*([^\n]+)/i);
  return {
    dates: range ? [] : datesFromPhrase(dataLine, today),
    times: times.times,
    rangeEnd: times.endTime,
    room: onlyRoom,
    rooms,
    priceLabel: price.priceLabel,
    free: price.free,
    minutes: duration ? Number(duration[1]) : minutesOf(page),
    age: cleanText(rating?.[1] ?? null) ?? ageOf(page),
    links: ticketLinks(serviceHtml),
  };
}

function parseDatedFilms(html: string, today: string): DatedFilm[] {
  const films: DatedFilm[] = [];
  for (const match of html.matchAll(/<p\b[\s\S]*?<\/p>/gi)) {
    const block = match[0];
    const text = toText(block).trim();
    const dateMatch = text.match(/^(\d{1,2})[./](\d{1,2})\b/);
    if (!dateMatch) continue;
    const date = isoDate(Number(dateMatch[1]), Number(dateMatch[2]), today);
    const title = [...block.matchAll(/<(?:strong|em)[^>]*>([\s\S]*?)<\/(?:strong|em)>/gi)]
      .map((part) => cleanText(part[1]))
      .find((part) => part && !/^\d{1,2}[./]\d{1,2}$/.test(part) && !/ingresso/i.test(part));
    if (!date || !title) continue;
    const purchase = block.match(/href="(https:\/\/www\.veloxtickets\.com[^"]+)"/i)?.[1] ?? null;
    films.push({
      title,
      date,
      minutes: minutesOf(text),
      age: ageOf(text),
      purchaseUrl: purchase ? decodeEntities(purchase) : null,
    });
  }
  return films;
}

function parseNight(html: string, info: ServiceInfo, today: string, when: string): NightFilm[] {
  const base = info.dates[0] ?? datesFromPhrase(when, today)[0];
  if (!base) return [];
  const films: NightFilm[] = [];
  for (const block of html.split(/<h2\b/i).slice(1)) {
    const heading = cleanText(block.match(/[\s\S]*?<\/h2>/)?.[0] ?? null) ?? "";
    const key = heading.match(/sala\s*\d+/i)?.[0].toLowerCase().replace(/\s+/g, " ") ?? null;
    if (!key) continue;
    const room = info.rooms.get(key) ?? heading.split(":")[0]?.trim() ?? null;
    let date = base;
    let previous = -1;
    for (const paragraph of block.matchAll(/<p\b[\s\S]*?<\/p>/gi)) {
      const titleLine = cleanText(paragraph[0].match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ?? null) ?? "";
      const timeMatch = titleLine.match(/^(\d{1,2})h(\d{2})?\s*\|\s*(.+)$/);
      if (!timeMatch) continue;
      const time = clock(timeMatch[1], timeMatch[2]);
      const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
      if (previous >= 0 && minutes < previous) date = shiftDate(date, 1);
      previous = minutes;
      const text = toText(paragraph[0]);
      films.push({ title: timeMatch[3].trim(), date, time, room, minutes: minutesOf(text), age: ageOf(text), purchaseUrl: null });
    }
  }
  return films;
}

function filmItems(
  films: Array<DatedFilm & { time: string; room: string | null }>,
  card: Card,
  info: ServiceInfo,
  used: Set<string>,
): ProgramItem[] {
  return films.map((film) => {
    const room = film.room ?? info.room;
    const id = takeId(film.title, room, used);
    const purchase = film.purchaseUrl ?? purchaseFor(info.links, film.time, room);
    return screening({
      id,
      title: film.title,
      subtitle: card.title,
      room,
      image: card.image,
      href: card.href,
      age: film.age ?? info.age,
      tags: [],
      sessions: withSessions(
        id,
        [film.date],
        [film.time || (info.times[0] ?? "")],
        info.rangeEnd,
        film.minutes,
        info.free ? "free" : "available",
        purchase,
        info.priceLabel,
      ),
    });
  });
}

function singleItem(card: Card, info: ServiceInfo, pageHtml: string, today: string, used: Set<string>): ProgramItem | null {
  const title = cleanText(pageHtml.match(/c-play-schedule__title[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? null) ?? card.title;
  const when = rangeFrom(card.when, today);
  const dates = info.dates.length > 0 ? info.dates : when ? [] : datesFromPhrase(card.when, today);
  if (dates.length === 0) {
    if (!when) return null;
    const id = takeId(title, info.room, used);
    return {
      id,
      venue: "belas-artes",
      room: info.room,
      title,
      subtitle: null,
      image: card.image,
      href: card.href,
      age: info.age,
      tags: [],
      kind: "span",
      span: { start: when.start, end: when.end, label: formatRange(when.start, when.end) },
      sessions: [],
      online: false,
      watchUrl: null,
    };
  }
  const id = takeId(title, info.room, used);
  return screening({
    id,
    title,
    subtitle: null,
    room: info.room,
    image: card.image,
    href: card.href,
    age: info.age,
    tags: [],
    sessions: withSessions(
      id,
      dates,
      info.times,
      info.rangeEnd,
      info.minutes,
      info.free ? "free" : "available",
      null,
      info.priceLabel,
      undefined,
      (sessionTime) => purchaseFor(info.links, sessionTime, info.room),
    ),
  });
}

function parseEventPage(html: string, card: Card, today: string, used: Set<string>): ProgramItem[] {
  const page = mainHtml(html);
  if (!page) return [];
  const cut = page.search(/<h3\b[^>]*>[\s\S]{0,300}?Serviço/i);
  const before = cut < 0 ? page : page.slice(0, cut);
  const info = readService(cut < 0 ? "" : page.slice(cut), page, today);
  const dated = parseDatedFilms(before, today);
  if (dated.length > 0) {
    const time = info.times[0] ?? "";
    return filmItems(
      dated.map((film) => ({ ...film, time, room: info.room })),
      card,
      info,
      used,
    );
  }
  const night = parseNight(before, info, today, card.when);
  if (night.length > 0) return filmItems(night, card, info, used);
  const item = singleItem(card, info, page, today, used);
  return item ? [item] : [];
}

function digestEvents(body: string): DigestEvent[] {
  const events: DigestEvent[] = [];
  for (const match of body.matchAll(/<p\b[\s\S]*?<\/p>/gi)) {
    const block = match[0];
    const text = toText(block);
    if (!/hor[aá]rio|ingresso|gratuit/i.test(text)) continue;
    const title = cleanText(block.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ?? null);
    if (!title || /^\d/.test(title)) continue;
    const price = priceFrom(text);
    const href = block.match(/href="(https?:\/\/[^"]+)"/i)?.[1] ?? null;
    const velox = block.match(/href="(https:\/\/www\.veloxtickets\.com[^"]+)"/i)?.[1] ?? null;
    events.push({
      title,
      href: href ? decodeEntities(href) : null,
      purchaseUrl: velox ? decodeEntities(velox) : null,
      horario: text.match(/Hor[aá]rios?:\s*([^\n]+)/i)?.[1]?.trim() ?? "",
      priceLabel: price.priceLabel,
      free: price.free,
      age: ageOf(text),
      minutes: minutesOf(text),
    });
  }
  return events;
}

function pipeFilms(body: string, today: string): DatedFilm[] {
  const films: DatedFilm[] = [];
  for (const match of body.matchAll(/<p\b[\s\S]*?<\/p>/gi)) {
    const title = cleanText(match[0].match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ?? null) ?? "";
    const parts = title.match(/^(\d{1,2})[./](\d{1,2})\s*\|\s*(.+)$/);
    if (!parts) continue;
    const date = isoDate(Number(parts[1]), Number(parts[2]), today);
    if (!date) continue;
    films.push({
      title: parts[3].trim(),
      date,
      minutes: minutesOf(toText(match[0])),
      age: ageOf(toText(match[0])),
      purchaseUrl: null,
    });
  }
  return films;
}

function parseDigest(html: string, card: Card, today: string, used: Set<string>): ProgramItem[] {
  const page = mainHtml(html);
  const items: ProgramItem[] = [];
  for (const chunk of page.split(/<h3\b/i).slice(1)) {
    const headingHtml = chunk.match(/[\s\S]*?<\/h3>/)?.[0] ?? "";
    const heading = cleanText(headingHtml.replace(/^[^>]*>/, "")) ?? "";
    const body = chunk.slice(chunk.indexOf("</h3>") + 5);
    if (!heading || normalize(heading) === normalize(card.when)) continue;
    const range = rangeFrom(heading, today);
    const single = heading.match(/^(\d{1,2})[./](\d{1,2})$/);
    if (range || single) {
      const date = single ? isoDate(Number(single[1]), Number(single[2]), today) : null;
      const events = digestEvents(body);
      if (range && events.length === 0) {
        const title = cleanText(body.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ?? null);
        if (title) {
          const id = takeId(title, null, used);
          items.push({
            id,
            venue: "belas-artes",
            room: null,
            title,
            subtitle: null,
            image: null,
            href: card.href,
            age: null,
            tags: [],
            kind: "span",
            span: { start: range.start, end: range.end, label: formatRange(range.start, range.end) },
            sessions: [],
            online: false,
            watchUrl: null,
          });
        }
      }
      for (const event of events) {
        const times = readTimes(event.horario);
        const href = event.href ?? card.href;
        if (range && times.times.length === 0) {
          const id = takeId(event.title, null, used);
          items.push({
            id,
            venue: "belas-artes",
            room: null,
            title: event.title,
            subtitle: null,
            image: null,
            href,
            age: event.age,
            tags: [],
            kind: "span",
            span: {
              start: range.start,
              end: range.end,
              label: [formatRange(range.start, range.end), event.horario || null].filter(Boolean).join(" · "),
            },
            sessions: [],
            online: false,
            watchUrl: null,
          });
          continue;
        }
        if (!date) continue;
        const id = takeId(event.title, null, used);
        items.push(
          screening({
            id,
            title: event.title,
            subtitle: null,
            room: null,
            image: null,
            href,
            age: event.age,
            tags: [],
            sessions: withSessions(
              id,
              [date],
              times.times,
              times.endTime,
              event.minutes,
              event.free ? "free" : "available",
              event.purchaseUrl,
              event.priceLabel,
            ),
          }),
        );
      }
      continue;
    }

    const films = pipeFilms(body, today);
    if (films.length === 0) continue;
    const text = toText(body);
    const shared = readTimes(labeled(text, "Horário") ?? "");
    const price = priceFrom(labeled(text, "Ingressos") ?? text);
    const href = body.match(/href="(https?:\/\/www\.cinebelasartes\.com\.br[^"]+)"/i)?.[1] ?? card.href;
    for (const film of films) {
      const id = takeId(film.title, null, used);
      items.push(
        screening({
          id,
          title: film.title,
          subtitle: heading,
          room: null,
          image: null,
          href: decodeEntities(href),
          age: film.age,
          tags: [],
          sessions: withSessions(
            id,
            [film.date],
            shared.times,
            shared.endTime,
            film.minutes,
            price.free ? "free" : "available",
            null,
            price.priceLabel,
          ),
        }),
      );
    }
  }
  return items;
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

async function attachRegularTickets(items: ProgramItem[]): Promise<void> {
  const hrefs = [...new Set(items.map((item) => item.href))];
  const pages = await mapPool(hrefs, 4, async (href) => [href, await fetchHtml(href)] as const);
  const tickets = new Map<string, string>();
  for (const [href, html] of pages) {
    const url = html?.match(/https?:\/\/www\.veloxtickets\.com\/Parceiro\/P-[^"'\s]+/)?.[0];
    if (url) tickets.set(href, decodeEntities(url));
  }
  for (const item of items) {
    const url = tickets.get(item.href);
    if (!url) continue;
    for (const session of item.sessions) session.purchaseUrl = url;
  }
}

export async function loadBelasArtes(now = new Date()): Promise<{ items: ProgramItem[]; warnings: string[] }> {
  const today = saoPauloToday(now);
  relayOnly = false;
  const regularHtml = await fetchHtml(REGULAR);
  const specialHtml = await fetchHtml(SPECIAL);
  const warnings: string[] = [];
  const used = new Set<string>();
  const regular = regularHtml ? parseRegular(regularHtml, today, used) : [];
  if (!regularHtml) warnings.push("A programação regular do Cine Belas Artes não respondeu.");
  else if (/relan[cç]amento/i.test(regularHtml) && regular.length === 0) {
    warnings.push("Os relançamentos do Cine Belas Artes não puderam ser lidos.");
  }

  const cards = specialHtml ? parseSpecialCards(specialHtml) : [];
  if (!specialHtml) warnings.push("A programação especial do Cine Belas Artes não respondeu.");

  const [pages] = await Promise.all([
    mapPool(cards, 4, async (card) => ({ card, html: await fetchHtml(card.href) })),
    attachRegularTickets(regular),
  ]);

  const detailed: ProgramItem[] = [];
  const digest: ProgramItem[] = [];
  const coveredTitles = new Set<string>();
  let missed = 0;
  for (const page of pages) {
    if (!page.html) {
      missed += 1;
      continue;
    }
    if (page.card.href.includes("programacao-de-outubro")) {
      digest.push(...parseDigest(page.html, page.card, today, used));
      continue;
    }
    const parsed = parseEventPage(page.html, page.card, today, used);
    if (parsed.length === 0) continue;
    detailed.push(...parsed);
    coveredTitles.add(normalize(page.card.title));
    for (const item of parsed) coveredTitles.add(normalize(item.title));
  }
  if (missed > 0) warnings.push("Parte da programação especial do Cine Belas Artes não respondeu.");

  const extra = digest.filter((item) => !coveredTitles.has(normalize(item.title)));
  if (specialHtml && cards.length > 0 && detailed.length + extra.length === 0 && missed === 0) {
    warnings.push("A programação especial do Cine Belas Artes não pôde ser lida.");
  }

  return { items: [...regular, ...detailed, ...extra], warnings };
}
