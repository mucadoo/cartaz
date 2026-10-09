import { loadBelasArtes } from "@/lib/belas-artes";
import { loadCinusp } from "@/lib/cinusp";
import { loadPetrobras } from "@/lib/petrobras";
import { loadBaccarelli } from "@/lib/baccarelli";
import { loadSaoPedro } from "@/lib/sao-pedro";
import { loadCinemateca } from "@/lib/cinemateca";
import { loadMunicipal } from "@/lib/municipal";
import { loadSala } from "@/lib/sala";
import { loadCineSesc } from "@/lib/sesc";
import type { Program, ProgramItem, VenueId, VenueWarning } from "@/lib/types";

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

export async function loadProgram(now = new Date()): Promise<Program> {
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
