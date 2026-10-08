import { fetchText } from "@/lib/http";
import type { Availability, Prices, ProgramItem, Session } from "@/lib/types";

const LISTING_URL = "https://www.sescsp.org.br/wp-json/wp/v1/atividades/filter";
const PORTAL_URL = "https://portal.sescsp.org.br/bilheteria/atividade.action";
const SITE = "https://www.sescsp.org.br";
const CINESESC_LOCAL = "52";
const PAGE_SIZE = 20;

type ListingImage = { file?: string };

type ListingActivity = {
  id: number;
  id_java?: string | number | null;
  imagem?: string | null;
  imagens?: Record<string, ListingImage | undefined>;
  link?: string | null;
  titulo?: string | null;
  complemento?: string | null;
  cancelado?: string | null;
  esgotado?: string | null;
  datasSessoes?: string[] | null;
  dataPrimeiraSessao?: string | null;
  dataUltimaSessao?: string | null;
  tipos_linguagens?: { titulo?: string | null }[] | null;
  publico_tag?: { titulo?: string | null }[] | null;
  gratuito?: string | null;
  online?: string | null;
};

type ListingResponse = {
  atividade?: Array<ListingActivity | null> | null;
  total?: { value?: number | null } | null;
};

type PortalSession = {
  idSessao?: number | string | null;
  dataInicialSessaoFmt?: string | null;
  dataFinalSessaoFmt?: string | null;
  dataInicialVendaOnlineFmt?: string | null;
  qtdeIngressosWeb?: number | string | null;
  qtdeIngressosRede?: number | string | null;
  codigoStatusEvento?: string | number | null;
  codigoStatusWP?: string | number | null;
  statusSessaoSesc?: string | null;
  statusIngresso?: string | null;
  dscStatusEvento?: string | null;
  ingressoOnlineDisponivel?: boolean | string | null;
  gratuito?: boolean | string | null;
  urlCompra?: string | null;
  valorInteira?: number | string | null;
  valorMeia?: number | string | null;
  valorComerciario?: number | string | null;
};

type PortalActivity = {
  sessoes?: PortalSession[] | null;
  possuiMais20Sessoes?: boolean | string | null;
  totalSessoes?: number | null;
  tipoClassificacao?: string | null;
  classificacaoMinina?: number | string | null;
  unidadePrincipal?: { endereco?: string | null } | null;
};

type HtmlSchedule = {
  sessions: { start: string; end: string | null }[];
  spanLabel: string | null;
  free: boolean;
  online: boolean;
  watchUrl: string | null;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function truthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function cleanText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

function absoluteUrl(link: string | null | undefined): string {
  if (!link) return `${SITE}/programacao/?id=52&unidade=CineSesc`;
  if (link.startsWith("http")) return link;
  return `${SITE}${link.startsWith("/") ? "" : "/"}${link}`;
}

function decodeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/&amp;/g, "&");
}

function splitLocal(iso: string): { date: string; time: string } | null {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return null;
  return { date: match[1], time: match[2] };
}

function parseSp(iso: string): Date | null {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return null;
  return new Date(`${match[1]}T${match[2]}:00-03:00`);
}

function isFutureSale(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false;
  const when = parseSp(iso);
  return Boolean(when && when.getTime() > now.getTime());
}

function pricesFrom(session: PortalSession): Prices | null {
  const prices = {
    full: asNumber(session.valorInteira),
    half: asNumber(session.valorMeia),
    credential: asNumber(session.valorComerciario),
  };
  if (prices.full == null && prices.half == null && prices.credential == null) return null;
  return prices;
}

function availabilityOf(session: PortalSession): Availability {
  const code = String(session.codigoStatusEvento ?? "");
  const wp = String(session.codigoStatusWP ?? "");
  const blob = [session.statusSessaoSesc, session.statusIngresso, session.dscStatusEvento]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (code === "1" || wp === "1" || blob.includes("cancel")) return "cancelled";
  if (truthyFlag(session.gratuito)) return "free";
  if (blob.includes("esgot")) return "soldout";

  const web = asNumber(session.qtdeIngressosWeb);
  const box = asNumber(session.qtdeIngressosRede);
  if (web === 0 && box === 0) return "soldout";
  if ((web === 0 || web == null) && (box ?? 0) > 0 && !truthyFlag(session.ingressoOnlineDisponivel)) {
    return "boxoffice";
  }
  if (web === 0 && (box ?? 0) > 0) return "boxoffice";
  return "available";
}

function ageLabel(activity: PortalActivity): string | null {
  const prefix = cleanText(activity.tipoClassificacao);
  const years = asNumber(activity.classificacaoMinina);
  if (prefix && years != null) return `${prefix} ${years} anos`;
  return prefix;
}

function imageUrl(activity: ListingActivity): string | null {
  const original = activity.imagem;
  const file =
    activity.imagens?.["atividade-img"]?.file ??
    activity.imagens?.medium_large?.file ??
    activity.imagens?.medium?.file;
  if (original && file) return original.replace(/[^/]+$/, file);
  return original ?? null;
}

function tagsOf(activity: ListingActivity): string[] {
  const language = (activity.tipos_linguagens ?? []).map((tag) => cleanText(tag.titulo));
  const audience = (activity.publico_tag ?? []).map((tag) => cleanText(tag.titulo));
  return [...language, ...audience].filter((tag): tag is string => Boolean(tag));
}

function sessionFromPortal(session: PortalSession, now: Date): Session | null {
  const start = session.dataInicialSessaoFmt ? splitLocal(session.dataInicialSessaoFmt) : null;
  if (!start) return null;
  const end = session.dataFinalSessaoFmt ? splitLocal(session.dataFinalSessaoFmt) : null;
  const saleOpensAt =
    session.dataInicialVendaOnlineFmt && isFutureSale(session.dataInicialVendaOnlineFmt, now)
      ? session.dataInicialVendaOnlineFmt
      : null;

  return {
    id: String(session.idSessao ?? `${start.date}-${start.time}`),
    date: start.date,
    time: start.time,
    endTime: end && end.time !== start.time ? end.time : null,
    webTickets: asNumber(session.qtdeIngressosWeb),
    boxOfficeTickets: asNumber(session.qtdeIngressosRede),
    availability: availabilityOf(session),
    saleOpensAt,
    purchaseUrl: decodeUrl(session.urlCompra),
    prices: truthyFlag(session.gratuito) ? null : pricesFrom(session),
    priceLabel: null,
  };
}

function parseDetailHtml(html: string): HtmlSchedule {
  const sessions: { start: string; end: string | null }[] = [];
  const pattern = /data-inicial="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})"[^>]*data-final="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})"/g;
  for (const match of html.matchAll(pattern)) {
    sessions.push({ start: match[1], end: match[2] });
  }

  const range = html.match(/data-range-mode="1"[\s\S]{0,900}?<b>\s*([^<]+?)\s*<\/b>/);
  const watch = html.match(/evento--sessao--entrada--url[\s\S]{0,400}?href="([^"]+)"/);

  return {
    sessions,
    spanLabel: cleanText(range?.[1] ?? null),
    free: html.includes("evento--sessao--entrada--gratis"),
    online: html.includes("atividade online"),
    watchUrl: watch?.[1] ? decodeUrl(watch[1].replace(/&amp;/g, "&")) : null,
  };
}

function looksLikeSpan(activity: ListingActivity): boolean {
  const dates = activity.datasSessoes ?? [];
  if (dates.length >= 14) return true;
  const start = activity.dataPrimeiraSessao ?? "";
  const end = activity.dataUltimaSessao ?? "";
  return start.endsWith("T00:00") && (end.endsWith("T23:59") || end.endsWith("T00:00"));
}

function listingSpan(activity: ListingActivity, label?: string | null): ProgramItem["span"] {
  const start = (activity.datasSessoes?.[0] ?? activity.dataPrimeiraSessao ?? "").slice(0, 10);
  const end = (
    activity.datasSessoes?.[activity.datasSessoes.length - 1] ??
    activity.dataUltimaSessao ??
    ""
  ).slice(0, 10);
  if (!start || !end) return null;
  return { start, end, label: label || `${start} a ${end}` };
}

function baseItem(activity: ListingActivity): Omit<ProgramItem, "kind" | "span" | "sessions" | "online" | "watchUrl" | "age"> {
  return {
    id: `cinesesc-${activity.id}`,
    venue: "cinesesc",
    room: null,
    title: cleanText(activity.titulo) ?? "Sessão sem título",
    subtitle: cleanText(activity.complemento),
    image: imageUrl(activity),
    href: absoluteUrl(activity.link),
    tags: tagsOf(activity),
  };
}

function fromPortal(activity: ListingActivity, portal: PortalActivity, now: Date): ProgramItem {
  const sessions = (portal.sessoes ?? [])
    .map((session) => sessionFromPortal(session, now))
    .filter((session): session is Session => Boolean(session))
    .sort(compareSessions);

  return {
    ...baseItem(activity),
    age: ageLabel(portal),
    kind: "screening",
    span: null,
    sessions,
    online: false,
    watchUrl: null,
  };
}

function fromHtml(activity: ListingActivity, schedule: HtmlSchedule): ProgramItem {
  const base = baseItem(activity);
  if (schedule.sessions.length > 0) {
    const sessions = schedule.sessions.flatMap((slot, index): Session[] => {
      const start = splitLocal(slot.start);
      if (!start) return [];
      const end = slot.end ? splitLocal(slot.end) : null;
      return [
        {
          id: `${activity.id}-${index}-${start.date}-${start.time}`,
          date: start.date,
          time: start.time,
          endTime: end && end.time !== start.time ? end.time : null,
          webTickets: null,
          boxOfficeTickets: null,
          availability: schedule.free ? "free" : "available",
          saleOpensAt: null,
          purchaseUrl: null,
          prices: null,
          priceLabel: null,
        },
      ];
    });
    return {
      ...base,
      age: null,
      kind: "screening",
      span: null,
      sessions: sessions.sort(compareSessions),
      online: schedule.online,
      watchUrl: schedule.watchUrl,
    };
  }

  return {
    ...base,
    age: null,
    kind: "span",
    span: listingSpan(activity, schedule.spanLabel),
    sessions: [],
    online: schedule.online,
    watchUrl: schedule.watchUrl,
  };
}

function fromListing(activity: ListingActivity): ProgramItem {
  const base = baseItem(activity);
  if (looksLikeSpan(activity)) {
    return {
      ...base,
      age: null,
      kind: "span",
      span: listingSpan(activity),
      sessions: [],
      online: Boolean(cleanText(activity.online)),
      watchUrl: null,
    };
  }

  const sessions = (activity.datasSessoes ?? []).map((date, index): Session => {
    const timed =
      activity.dataPrimeiraSessao?.startsWith(date) ? splitLocal(activity.dataPrimeiraSessao) : null;
    return {
      id: `${activity.id}-listing-${index}`,
      date,
      time: timed?.time && timed.time !== "00:00" ? timed.time : "",
      endTime: null,
      webTickets: null,
      boxOfficeTickets: null,
      availability: cleanText(activity.cancelado) ? "cancelled" : cleanText(activity.esgotado) ? "soldout" : "available",
      saleOpensAt: null,
      purchaseUrl: null,
      prices: null,
      priceLabel: null,
    };
  });

  return {
    ...base,
    age: null,
    kind: sessions.length ? "screening" : "span",
    span: sessions.length ? null : listingSpan(activity),
    sessions,
    online: Boolean(cleanText(activity.online)),
    watchUrl: null,
  };
}

function compareSessions(a: Session, b: Session): number {
  return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
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
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchListingPage(page: number): Promise<ListingResponse | null> {
  const url = new URL(LISTING_URL);
  url.searchParams.set("local", CINESESC_LOCAL);
  url.searchParams.set("tipo", "atividade");
  url.searchParams.set("ppp", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("categoria", "");
  url.searchParams.set("data_inicial", "");
  url.searchParams.set("data_final", "");
  const body = await fetchText(url.toString());
  if (!body) return null;
  try {
    return JSON.parse(body) as ListingResponse;
  } catch {
    return null;
  }
}

async function fetchAllActivities(): Promise<ListingActivity[]> {
  const first = await fetchListingPage(1);
  if (!first) throw new Error("Não foi possível ler a programação do CineSesc.");

  const total = first.total?.value ?? PAGE_SIZE;
  const pages = Math.min(8, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) => fetchListingPage(index + 2)),
  );

  const seen = new Set<number>();
  const activities: ListingActivity[] = [];
  for (const page of [first, ...rest]) {
    for (const activity of page?.atividade ?? []) {
      if (!activity?.id || seen.has(activity.id)) continue;
      seen.add(activity.id);
      activities.push(activity);
    }
  }
  return activities;
}

async function fetchPortal(javaId: string): Promise<PortalActivity | null> {
  const first = await fetchPortalPage(javaId);
  if (!first) return null;

  const sessions = [...(first.sessoes ?? [])];
  const seen = new Set(sessions.map((session) => String(session.idSessao)));

  if (truthyFlag(first.possuiMais20Sessoes)) {
    for (let page = 1; page <= 4; page += 1) {
      const next = await fetchPortalPage(javaId, page);
      const batch = next?.sessoes ?? [];
      const fresh = batch.filter((session) => {
        const id = String(session.idSessao);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      if (fresh.length === 0) break;
      sessions.push(...fresh);
      if (!truthyFlag(next?.possuiMais20Sessoes) && batch.length < 20) break;
    }
  }

  return { ...first, sessoes: sessions };
}

async function fetchPortalPage(javaId: string, page = 0): Promise<PortalActivity | null> {
  const url = new URL(PORTAL_URL);
  url.searchParams.set("idAtividade", javaId);
  if (page > 0) url.searchParams.set("pagina", String(page));
  const body = await fetchText(url.toString());
  if (!body) return null;
  try {
    const data = JSON.parse(body) as PortalActivity;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

export async function loadCineSesc(now = new Date()): Promise<{ items: ProgramItem[]; warnings: string[] }> {
  const activities = await fetchAllActivities();
  let missingDetail = false;

  const items = await mapPool(activities, 6, async (activity) => {
    const javaId = activity.id_java ? String(activity.id_java) : "";
    if (javaId) {
      const portal = await fetchPortal(javaId);
      if (portal?.sessoes?.length) return fromPortal(activity, portal, now);
    }

    const html = activity.link ? await fetchText(absoluteUrl(activity.link)) : null;
    if (html) {
      const item = fromHtml(activity, parseDetailHtml(html));
      if (javaId && item.sessions.length === 0) missingDetail = true;
      return item;
    }

    if (javaId) missingDetail = true;
    return fromListing(activity);
  });

  return {
    items,
    warnings: missingDetail ? ["Alguns filmes do CineSesc ficaram só com as datas da listagem."] : [],
  };
}

