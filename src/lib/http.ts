import { AsyncLocalStorage } from "node:async_hooks";

const HEADERS = {
  Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

const freshRequests = new AsyncLocalStorage<true>();

export function withFreshFetch<T>(work: () => Promise<T>): Promise<T> {
  return freshRequests.run(true, work);
}

function request(url: string, init: RequestInit | undefined, fresh: boolean): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...HEADERS, ...(init?.headers as Record<string, string> | undefined) },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
    ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 600 } }),
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
