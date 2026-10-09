import { collectCinemateca } from "@/lib/cinemateca-parse";
import { fetchText, withFreshFetch } from "@/lib/http";
import type { ProgramItem } from "@/lib/types";

type SourceResult = { items: ProgramItem[]; warnings: string[] };

async function fetchJson(url: string): Promise<string | null> {
  const body = await fetchText(url);
  if (body?.trimStart().startsWith("{")) return body;
  return withFreshFetch(() => fetchText(url));
}

export async function loadCinemateca(now = new Date()): Promise<SourceResult> {
  const items = await collectCinemateca(now, fetchJson);
  if (!items) return { items: [], warnings: ["A programação da Cinemateca não respondeu."] };
  return { items, warnings: [] };
}
