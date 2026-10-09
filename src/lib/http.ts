import { AsyncLocalStorage } from "node:async_hooks";

const HEADERS = {
  Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "User-Agent": "Cartaz/1.0 (calendario de programacao cultural)",
};

/** Full program. Twice a day. */
export const PROGRAM_REVALIDATE_SECONDS = 12 * 60 * 60;

/** Ticket stock for houses that still have seats on sale. */
export const TICKET_REVALIDATE_SECONDS = 2 * 60 * 60;

const freshRequests = new AsyncLocalStorage<true>();
const revalidateRequests = new AsyncLocalStorage<number>();

export function withFreshFetch<T>(work: () => Promise<T>): Promise<T> {
  return freshRequests.run(true, work);
}

export function withRevalidate<T>(seconds: number, work: () => Promise<T>): Promise<T> {
  return revalidateRequests.run(seconds, work);
}

function request(url: string, init: RequestInit | undefined, fresh: boolean): Promise<Response> {
  const revalidate = revalidateRequests.getStore() ?? PROGRAM_REVALIDATE_SECONDS;
  return fetch(url, {
    ...init,
    headers: { ...HEADERS, ...(init?.headers as Record<string, string> | undefined) },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
    ...(fresh ? { cache: "no-store" as const } : { next: { revalidate } }),
  });
}

export async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
  const fresh = freshRequests.getStore() === true;
  try {
    let response = await request(url, init, fresh);
    if (!response.ok && !fresh) response = await request(url, init, true);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    if (fresh) return null;
    try {
      const response = await request(url, init, true);
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }
}
