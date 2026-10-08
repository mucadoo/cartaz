const HEADERS = {
  Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
  "User-Agent": "Cartaz/1.0 (calendario de programacao cultural)",
};

export async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...HEADERS, ...(init?.headers as Record<string, string> | undefined) },
      signal: init?.signal ?? AbortSignal.timeout(20000),
      next: { revalidate: 600 },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}
