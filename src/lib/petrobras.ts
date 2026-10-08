import { saoPauloToday } from "@/lib/dates";
import { fetchText } from "@/lib/http";
import type { ProgramItem, Session } from "@/lib/types";

const HOME = "https://espacopetrobrasdecinema.com.br/";
const HTML = { Accept: "text/html" };

type Slot = { date: string; time: string; room: string };

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

function clock(hour: string, minute: string): string {
  return `${hour.padStart(2, "0")}:${minute}`;
}

function addMinutes(time: string, minutes: number): string | null {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
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

function priceFor(date: string, halfForEveryone: boolean): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (day === 2) return halfForEveryone ? "R$14,00 (meia-entrada para todos)" : "R$14,00 (meia-entrada) a R$28,00 (inteira)";
  if (day === 3) return halfForEveryone ? "R$16,00 (meia-entrada para todos)" : "R$16,00 (meia-entrada) a R$32,00 (inteira)";
  if (day === 1) return "R$16,00 (meia-entrada) a R$32,00 (inteira)";
  return "R$20,00 (meia-entrada) a R$40,00 (inteira)";
}

function clocksIn(value: string): string[] {
  return [...value.matchAll(/(\d{1,2})h(\d{2})/gi)].map((match) => clock(match[1], match[2]));
}

function roomLabel(value: string): string | null {
  const match = value.match(/sala\s*0*(\d+)/i);
  return match ? `Sala ${match[1]}` : null;
}

function slotsFrom(rest: string, date: string): Slot[] {
  const slots: Slot[] = [];
  let pending: string[] = [];
  for (const piece of rest.split("|").map((part) => part.trim()).filter(Boolean)) {
    const roomAt = piece.toLowerCase().indexOf("sala");
    if (roomAt < 0) {
      pending.push(...clocksIn(piece));
      continue;
    }
    pending.push(...clocksIn(piece.slice(0, roomAt)));
    const room = roomLabel(piece);
    if (room) {
      for (const time of pending) slots.push({ date, time, room });
    }
    pending = clocksIn(piece.slice(roomAt));
  }
  return slots;
}

function scheduleOf(block: string, today: string): Slot[] {
  const paragraph = block.match(/Horários[\s\S]*?<div class="tab-pane[\s\S]*?<p>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  const slots: Slot[] = [];
  for (const match of paragraph.matchAll(/\((\d{2})\/(\d{2})\)\s*<\/strong>([\s\S]*?)(?=\(\d{2}\/\d{2}\)|$)/gi)) {
    const date = isoDate(Number(match[1]), Number(match[2]), today);
    if (!date) continue;
    slots.push(...slotsFrom(cleanText(match[3]) ?? "", date));
  }
  return slots;
}

function poster(block: string): string | null {
  const urls = [...block.matchAll(/data-orig-src="(https:[^"]+\.(?:jpe?g|png|webp)(?:\?[^"]*)?)"/gi)].map((match) => match[1]);
  return urls.find((url) => !/acessibilidade|logo|icon|banner/i.test(url)) ?? null;
}

function takeId(title: string, room: string, used: Set<string>): string {
  const base = `petrobras-${slug(title)}-${slug(room)}`.slice(0, 90);
  let id = base;
  let count = 2;
  while (used.has(id)) {
    id = `${base}-${count}`;
    count += 1;
  }
  used.add(id);
  return id;
}

function parseFilms(html: string, today: string): ProgramItem[] {
  const halfForEveryone = /ter[cç]as e quartas[\s\S]{0,80}meia-entrada para todos/i.test(html);
  const used = new Set<string>();
  const items: ProgramItem[] = [];

  for (const block of html.split("post-card ").slice(1)) {
    const title = cleanText(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? null);
    if (!title || !normalize(block).includes("relancamento")) continue;
    const lines = [...block.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/gi)]
      .map((match) => cleanText(match[1]))
      .filter((line): line is string => Boolean(line));
    const director = lines.find((line) => /^dirigido por /i.test(line))?.replace(/^dirigido por /i, "") ?? null;
    const facts = lines.find((line) => /\d+\s*min/i.test(line)) ?? "";
    const relaunch = facts.match(/relan[cç]amento[^),]*/i)?.[0] ?? "Relançamento";
    const minutes = Number(facts.match(/(\d+)\s*min/i)?.[1] ?? "");
    const genre = facts
      .split(",")
      .map((part) => part.trim())
      .find((part, index, parts) => index < parts.length - 1 && /\d+\s*min/i.test(parts[index + 1] ?? ""));
    const ageMatch = block.match(/menores de\s+(\d+)\s+anos/i);
    const age = ageMatch ? `${ageMatch[1]} anos` : /classifica[cç][aã]o livre/i.test(block) ? "Livre" : null;
    const purchase = block.match(/https:\/\/www\.veloxtickets\.com\/Parceiro\/P-[^"'\s]+/)?.[0] ?? null;
    const image = poster(block);
    const byRoom = new Map<string, Slot[]>();
    for (const slot of scheduleOf(block, today)) {
      const list = byRoom.get(slot.room) ?? [];
      list.push(slot);
      byRoom.set(slot.room, list);
    }

    for (const [room, slots] of byRoom) {
      const id = takeId(title, room, used);
      const sessions: Session[] = slots
        .map((slot) => ({
          id: `${id}-${slot.date}-${slot.time}`,
          date: slot.date,
          time: slot.time,
          endTime: Number.isFinite(minutes) && minutes > 0 ? addMinutes(slot.time, minutes) : null,
          webTickets: null,
          boxOfficeTickets: null,
          availability: "available" as const,
          saleOpensAt: null,
          purchaseUrl: purchase ? decodeEntities(purchase) : null,
          prices: null,
          priceLabel: priceFor(slot.date, halfForEveryone),
        }))
        .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
      if (sessions.length === 0) continue;
      const label = relaunch.charAt(0).toUpperCase() + relaunch.slice(1);
      items.push({
        id,
        venue: "petrobras",
        room,
        title,
        subtitle: [label, director ? `Direção: ${director}` : null].filter(Boolean).join(" · "),
        image,
        href: HOME,
        age,
        tags: genre ? [genre] : [],
        kind: "screening",
        span: null,
        sessions,
        online: false,
        watchUrl: null,
      });
    }
  }

  return items;
}

export async function loadPetrobras(now = new Date()): Promise<{ items: ProgramItem[]; warnings: string[] }> {
  const html = await fetchText(HOME, { headers: HTML });
  if (!html) return { items: [], warnings: ["A programação do Espaço Petrobras não respondeu."] };
  const items = parseFilms(html, saoPauloToday(now));
  if (/relan[cç]amento/i.test(html) && items.length === 0) {
    return { items: [], warnings: ["Os relançamentos do Espaço Petrobras não puderam ser lidos."] };
  }
  return { items, warnings: [] };
}
