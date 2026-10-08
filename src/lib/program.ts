import { loadBelasArtes } from "@/lib/belas-artes";
import { loadCinusp } from "@/lib/cinusp";
import { loadPetrobras } from "@/lib/petrobras";
import { loadBaccarelli } from "@/lib/baccarelli";
import { loadSaoPedro } from "@/lib/sao-pedro";
import { loadCinemateca } from "@/lib/cinemateca";
import { loadMunicipal } from "@/lib/municipal";
import { loadSala } from "@/lib/sala";
import { loadCineSesc } from "@/lib/sesc";
import type { Program, ProgramItem } from "@/lib/types";

const FAILED: Record<string, string> = {
  cinesesc: "A programação do CineSesc não respondeu.",
  cinemateca: "A programação da Cinemateca não respondeu.",
  "belas-artes": "A programação do Cine Belas Artes não respondeu.",
  petrobras: "A programação do Espaço Petrobras não respondeu.",
  cinusp: "A programação do CINUSP não respondeu.",
  sala: "A programação da Sala São Paulo não respondeu.",
  municipal: "A programação do Theatro Municipal não respondeu.",
  baccarelli: "A programação do Teatro Baccarelli não respondeu.",
  "sao-pedro": "A programação do Theatro São Pedro não respondeu.",
};

export async function loadProgram(now = new Date()): Promise<Program> {
  const settled = await Promise.allSettled([
    loadCineSesc(now),
    loadCinemateca(now),
    loadBelasArtes(now),
    loadPetrobras(now),
    loadCinusp(),
    loadSala(),
    loadMunicipal(),
    loadBaccarelli(now),
    loadSaoPedro(),
  ]);
  const keys = ["cinesesc", "cinemateca", "belas-artes", "petrobras", "cinusp", "sala", "municipal", "baccarelli", "sao-pedro"] as const;
  const items: ProgramItem[] = [];
  const warnings: string[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(...result.value.items);
      warnings.push(...result.value.warnings);
      return;
    }
    warnings.push(FAILED[keys[index]]);
  });

  if (items.length === 0) {
    throw new Error(warnings[0] ?? "A programação não carregou.");
  }

  items.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

  return {
    items,
    updatedAt: now.toISOString(),
    warnings,
  };
}
