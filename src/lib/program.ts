import { loadBelasArtes } from "@/lib/belas-artes";
import { loadCinusp } from "@/lib/cinusp";
import { loadPetrobras } from "@/lib/petrobras";
import { loadBaccarelli } from "@/lib/baccarelli";
import { loadSaoPedro } from "@/lib/sao-pedro";
import { loadCinemateca } from "@/lib/cinemateca";
import { loadMunicipal } from "@/lib/municipal";
import { loadSala } from "@/lib/sala";
import { loadAfro, loadCcbb, loadItau, loadMam, loadMasp, loadMis, loadPinacoteca, loadTomie } from "@/lib/exhibitions";
import { loadCineSesc } from "@/lib/sesc";
import { saoPauloToday } from "@/lib/dates";
import { TICKET_REVALIDATE_SECONDS, withRevalidate } from "@/lib/http";
import type { Program, ProgramItem, Session, VenueId, VenueWarning } from "@/lib/types";

const FAILED: Record<VenueId, string> = {
  cinesesc: "A programação do CineSesc não respondeu.",
  cinemateca: "A programação da Cinemateca não respondeu.",
  "belas-artes": "A programação do Cine Belas Artes não respondeu.",
  petrobras: "A programação do Espaço Petrobras não respondeu.",
  cinusp: "A programação do CINUSP não respondeu.",
  "sala-sp": "A programação da Sala São Paulo não respondeu.",
  municipal: "A programação do Theatro Municipal não respondeu.",
  baccarelli: "A programação do Teatro Baccarelli não respondeu.",
  "sao-pedro": "A programação do Theatro São Pedro não respondeu.",
  masp: "A programação do MASP não respondeu.",
  mis: "A programação do MIS não respondeu.",
  itau: "A programação do Itaú Cultural não respondeu.",
  pinacoteca: "A programação da Pinacoteca não respondeu.",
  mam: "A programação do MAM não respondeu.",
  tomie: "A programação do Instituto Tomie Ohtake não respondeu.",
  ccbb: "A programação do CCBB não respondeu.",
  afro: "A programação do Museu Afro Brasil não respondeu.",
};

const SOURCES: Record<VenueId, (now: Date) => Promise<{ items: ProgramItem[]; warnings: string[] }>> = {
  cinesesc: loadCineSesc,
  cinemateca: loadCinemateca,
  "belas-artes": loadBelasArtes,
  petrobras: loadPetrobras,
  cinusp: () => loadCinusp(),
  "sala-sp": () => loadSala(),
  municipal: () => loadMunicipal(),
  baccarelli: loadBaccarelli,
  "sao-pedro": () => loadSaoPedro(),
  masp: loadMasp,
  mis: loadMis,
  itau: loadItau,
  pinacoteca: loadPinacoteca,
  mam: loadMam,
  tomie: loadTomie,
  ccbb: loadCcbb,
  afro: loadAfro,
};

export const VENUE_IDS = Object.keys(SOURCES) as VenueId[];

export async function loadVenue(id: VenueId, now = new Date()): Promise<{ items: ProgramItem[]; warnings: VenueWarning[] }> {
  try {
    const result = await SOURCES[id](now);
    return {
      items: result.items,
      warnings: result.warnings.map((message) => ({ venue: id, message })),
    };
  } catch {
    return { items: [], warnings: [{ venue: id, message: FAILED[id] }] };
  }
}

function sessionOnSale(session: Session, today: string): boolean {
  if (session.date < today) return false;
  if (session.availability !== "available" && session.availability !== "boxoffice") return false;
  const priced = Boolean(
    session.prices && (session.prices.full != null || session.prices.half != null || session.prices.credential != null),
  );
  return Boolean(session.purchaseUrl || session.priceLabel || priced || session.webTickets != null || session.boxOfficeTickets != null);
}

function venuesOnSale(items: ProgramItem[], today: string): VenueId[] {
  const ids = new Set<VenueId>();
  for (const item of items) {
    if (item.sessions.some((session) => sessionOnSale(session, today))) ids.add(item.venue);
  }
  return VENUE_IDS.filter((id) => ids.has(id));
}

async function collect(now: Date): Promise<Program> {
  const settled = await Promise.allSettled(VENUE_IDS.map((id) => loadVenue(id, now)));
  const items: ProgramItem[] = [];
  const warnings: VenueWarning[] = [];

  settled.forEach((result, index) => {
    const id = VENUE_IDS[index];
    if (result.status === "fulfilled") {
      items.push(...result.value.items);
      warnings.push(...result.value.warnings);
      return;
    }
    warnings.push({ venue: id, message: FAILED[id] });
  });

  if (items.length === 0) {
    throw new Error(warnings[0]?.message ?? "A programação não carregou.");
  }

  items.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

  return {
    items,
    updatedAt: now.toISOString(),
    warnings,
  };
}

export async function loadProgram(now = new Date()): Promise<Program> {
  const program = await collect(now);
  const watch = venuesOnSale(program.items, saoPauloToday(now));
  if (watch.length === 0) return program;

  const refreshed = await withRevalidate(TICKET_REVALIDATE_SECONDS, () => Promise.all(watch.map((id) => loadVenue(id, now))));
  const watched = new Set(watch);
  const items = program.items.filter((item) => !watched.has(item.venue));
  const warnings = program.warnings.filter((warning) => !watched.has(warning.venue));

  refreshed.forEach((result, index) => {
    const id = watch[index];
    if (result.items.length === 0 && result.warnings.length > 0) {
      items.push(...program.items.filter((item) => item.venue === id));
      warnings.push(...program.warnings.filter((warning) => warning.venue === id));
      return;
    }
    items.push(...result.items);
    warnings.push(...result.warnings);
  });

  items.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

  return {
    items,
    updatedAt: now.toISOString(),
    warnings,
  };
}
