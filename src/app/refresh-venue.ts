"use server";

import { withFreshFetch } from "@/lib/http";
import { loadVenue, VENUE_IDS } from "@/lib/program";
import type { ProgramItem, VenueId, VenueWarning } from "@/lib/types";

export async function refreshVenue(venue: VenueId): Promise<{ items: ProgramItem[]; warnings: VenueWarning[]; updatedAt: string }> {
  if (!VENUE_IDS.includes(venue)) {
    return { items: [], warnings: [], updatedAt: new Date().toISOString() };
  }

  return withFreshFetch(async () => {
    const result = await loadVenue(venue);
    return { ...result, updatedAt: new Date().toISOString() };
  });
}
