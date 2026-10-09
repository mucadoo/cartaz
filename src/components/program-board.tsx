"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  WEEKDAYS,
  brl,
  formatLongDate,
  formatSaleOpening,
  formatUpdatedAt,
  daysInMonth,
  monthGrid,
  monthLabel,
  shiftMonth,
} from "@/lib/dates";
import { screeningsOn } from "@/lib/schedule";
import type { Availability, Program, ProgramItem, Session, VenueId, VenueWarning } from "@/lib/types";
import { placeLine, VENUE_LIST, VENUES } from "@/lib/venues";
import { refreshVenue } from "@/app/refresh-venue";
import { collectCinemateca } from "@/lib/cinemateca-parse";
import { ThemeToggle } from "@/components/theme-toggle";

async function browserBody(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

const BROWSER_SOURCES: Partial<Record<VenueId, () => Promise<ProgramItem[] | null>>> = {
  cinemateca: () => collectCinemateca(new Date(), browserBody),
};

type Filter = "all" | "open";
type BoardView = "dia" | "mes" | "agenda";
type Screening = { item: ProgramItem; session: Session };

const VIEWS: { id: BoardView; label: string }[] = [
  { id: "dia", label: "Dia" },
  { id: "mes", label: "Mês" },
  { id: "agenda", label: "Agenda" },
];

const FULL_DAY_LINES = 4;

const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "Disponível",
  boxoffice: "Só na bilheteria",
  soldout: "Esgotado",
  cancelled: "Cancelado",
  free: "Grátis",
};

function isOpen(availability: Availability): boolean {
  return availability === "available" || availability === "boxoffice" || availability === "free";
}

function statusClass(availability: Availability): string {
  switch (availability) {
    case "available":
      return "bg-[#e5f3ea] text-[#145c38]";
    case "boxoffice":
      return "bg-[#f8ecd4] text-[#8a5a12]";
    case "free":
      return "bg-[#e7eef8] text-[#1d3f73]";
    case "soldout":
      return "bg-[#f8e4e4] text-[#8d2430]";
    case "cancelled":
      return "bg-[#ece7e2] text-[#6d625b] line-through";
  }
}

function showsStatus(session: Session): boolean {
  if (session.availability !== "available") return true;
  return Boolean(
    session.purchaseUrl || session.prices || session.priceLabel || session.webTickets != null || session.boxOfficeTickets != null,
  );
}

function priceLine(session: Session): string | null {
  if (session.priceLabel) return session.priceLabel;
  if (!session.prices) return null;
  const parts: string[] = [];
  if (session.prices.full != null) parts.push(`Inteira ${brl(session.prices.full)}`);
  if (session.prices.half != null) parts.push(`meia ${brl(session.prices.half)}`);
  if (session.prices.credential != null) parts.push(`credencial ${brl(session.prices.credential)}`);
  return parts.join(" · ");
}

function ticketLine(session: Session): string | null {
  if (session.availability === "free" || session.availability === "cancelled") return null;
  const parts: string[] = [];
  if (session.webTickets != null) parts.push(`${session.webTickets} na web`);
  if (session.boxOfficeTickets != null) parts.push(`${session.boxOfficeTickets} na bilheteria`);
  return parts.length ? parts.join(" · ") : null;
}

export function ProgramBoard({ program, today, selectedDate }: { program: Program; today: string; selectedDate: string }) {
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  const [selected, setSelected] = useState(selectedDate);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<BoardView>("dia");
  const [venues, setVenues] = useState<VenueId[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState(program.items);
  const [warnings, setWarnings] = useState(program.warnings);
  const [updatedAt, setUpdatedAt] = useState(program.updatedAt);
  const [refreshing, setRefreshing] = useState<VenueId[]>([]);

  const visibleItems = useMemo(
    () => (venues.length === 0 ? items : items.filter((item) => venues.includes(item.venue))),
    [items, venues],
  );

  const screeningDates = useMemo(() => {
    const dates = visibleItems.flatMap((item) => item.sessions.map((session) => session.date));
    return [...new Set(dates)].sort();
  }, [visibleItems]);

  const bounds = useMemo(() => {
    const spanEdges = visibleItems.flatMap((item) => (item.span ? [item.span.start, item.span.end] : []));
    const all = [...screeningDates, ...spanEdges, today].filter(Boolean).sort();
    return { min: (all[0] ?? today).slice(0, 7), max: (all[all.length - 1] ?? today).slice(0, 7) };
  }, [visibleItems, screeningDates, today]);

  const cells = monthGrid(month);
  const dayEntries = screeningsOn(visibleItems, selected).filter(({ session }) =>
    filter === "all" ? true : isOpen(session.availability),
  );
  const openItem = visibleItems.find((item) => item.id === openId) ?? null;
  const spansThisMonth = visibleItems.filter((item) => {
    if (item.kind !== "span" || !item.span) return false;
    const start = item.span.start.slice(0, 7);
    const end = item.span.end.slice(0, 7);
    return start <= month && end >= month;
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cartaz-view");
      if (saved === "dia" || saved === "mes" || saved === "agenda") setView(saved);
    } catch {
      /* the view stays on the day */
    }
  }, []);

  useEffect(() => {
    if (openId && !visibleItems.some((item) => item.id === openId)) setOpenId(null);
  }, [openId, visibleItems]);

  useEffect(() => {
    if (!openId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  function entriesFor(date: string) {
    return screeningsOn(visibleItems, date).filter(({ session }) => (filter === "all" ? true : isOpen(session.availability)));
  }

  function countsFor(date: string) {
    const sessions = entriesFor(date).map(({ session }) => session);
    const open = sessions.filter((session) => isOpen(session.availability)).length;
    return { total: sessions.length, open, soldOnly: sessions.length > 0 && open === 0 };
  }

  function goTo(date: string) {
    setSelected(date);
    setMonth(date.slice(0, 7));
  }

  function changeMonth(next: string) {
    setMonth(next);
    setSelected((current) => {
      if (current.startsWith(next)) return current;
      const candidate = `${next}-${current.slice(-2)}`;
      const days = daysInMonth(next);
      return days.includes(candidate) ? candidate : (days[0] ?? current);
    });
  }

  function chooseView(next: BoardView) {
    setView(next);
    try {
      localStorage.setItem("cartaz-view", next);
    } catch {
      /* the choice still applies for this visit */
    }
  }

  function toggleVenue(id: VenueId) {
    setVenues((current) => {
      if (current.length === 0) return [id];
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      if (next.length === 0 || next.length === VENUE_LIST.length) return [];
      return next;
    });
  }

  const houseLabel = venues.length === 0 ? "No dia" : venues.length === 1 ? VENUES[venues[0]].name : `${venues.length} casas`;

  function applyVenue(id: VenueId, venueItems: ProgramItem[], venueWarnings: VenueWarning[]) {
    setItems((current) => {
      const next = [...current.filter((item) => item.venue !== id), ...venueItems].sort((a, b) =>
        a.title.localeCompare(b.title, "pt-BR"),
      );
      setOpenId((open) => (open && next.some((item) => item.id === open) ? open : null));
      return next;
    });
    setWarnings((current) => [...current.filter((warning) => warning.venue !== id), ...venueWarnings]);
    setUpdatedAt(new Date().toISOString());
  }

  async function loadInBrowser(id: VenueId): Promise<boolean> {
    const source = BROWSER_SOURCES[id];
    if (!source) return false;
    const found = await source();
    if (!found) return false;
    applyVenue(id, found, []);
    return true;
  }

  async function updateVenue(id: VenueId) {
    setRefreshing((current) => (current.includes(id) ? current : [...current, id]));
    try {
      const result = await refreshVenue(id).catch(() => null);
      if (result && result.warnings.length === 0) {
        applyVenue(id, result.items, []);
        return;
      }
      if (await loadInBrowser(id)) return;
      if (result) applyVenue(id, result.items, result.warnings);
      else {
        setWarnings((current) => [
          ...current.filter((warning) => warning.venue !== id),
          { venue: id, message: `A programação de ${VENUES[id].name} não respondeu.` },
        ]);
      }
    } finally {
      setRefreshing((current) => current.filter((item) => item !== id));
    }
  }

  useEffect(() => {
    const failed = [...new Set(program.warnings.map((warning) => warning.venue))].filter((id) => BROWSER_SOURCES[id]);
    for (const id of failed) {
      setRefreshing((current) => (current.includes(id) ? current : [...current, id]));
      loadInBrowser(id).finally(() => setRefreshing((current) => current.filter((item) => item !== id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.warnings]);

  const failedVenues = [...new Set(warnings.map((warning) => warning.venue))];
  const agendaDays = daysInMonth(month)
    .map((date) => ({ date, entries: entriesFor(date) }))
    .filter((day) => day.entries.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="grid gap-6 border-b border-line pb-8 md:grid-cols-[1.4fr_0.8fr] md:items-end">
        <div>
          <p className="font-serif text-sm tracking-[0.28em] text-gold uppercase">Cartaz</p>
          <h1 className="mt-3 font-serif text-5xl leading-none text-ink sm:text-7xl">Programação</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            CineSesc, Cinemateca, Cine Belas Artes, Espaço Petrobras, CINUSP, Sala São Paulo, Theatro Municipal, Teatro Baccarelli e Theatro São Pedro no mesmo calendário.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <div className="flex flex-wrap gap-2">
            {VENUE_LIST.map((place) => (
              <a
                key={place.id}
                href={place.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-gold-line px-4 py-2 text-sm text-ink transition hover:bg-gold hover:text-on-gold"
              >
                {place.name}
              </a>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle />
            <p className="text-sm text-faint">Atualizado {formatUpdatedAt(updatedAt)}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Casas">
        <FilterChip pressed={venues.length === 0} onClick={() => setVenues([])}>
          Todas
        </FilterChip>
        {VENUE_LIST.map((place) => (
          <FilterChip key={place.id} pressed={venues.includes(place.id)} onClick={() => toggleVenue(place.id)}>
            <span className={`size-1.5 rounded-full ${place.dot}`} />
            {place.name}
          </FilterChip>
        ))}
      </div>

      {failedVenues.length > 0 && (
        <div className="flex flex-col gap-2">
          {failedVenues.map((id) => (
            <VenueAlert
              key={id}
              warnings={warnings.filter((warning) => warning.venue === id)}
              refreshing={refreshing.includes(id)}
              onUpdate={() => updateVenue(id)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full bg-chip p-1 text-sm" role="group" aria-label="Vista">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => chooseView(option.id)}
              aria-pressed={view === option.id}
              className={`rounded-full px-3 py-1.5 ${view === option.id ? "bg-pressed text-pressed-ink" : "text-chip-ink"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-full bg-chip p-1 text-sm" role="group" aria-label="Sessões">
          {(
            [
              ["all", "Tudo"],
              ["open", "Com lugar"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`rounded-full px-3 py-1.5 ${filter === value ? "bg-pressed text-pressed-ink" : "text-chip-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "agenda" ? (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-3">
            <MonthNav month={month} bounds={bounds} onMonth={changeMonth} onToday={() => goTo(today)} plain />
          </div>
          <Agenda days={agendaDays} onOpen={setOpenId} />
        </div>
      ) : (
        <div className={view === "dia" ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]" : "flex flex-col gap-6"}>
          <section className="rounded-[28px] border border-line bg-paper p-4 text-paper-ink shadow-[0_30px_80px_var(--shadow)] sm:p-6">
            <MonthNav month={month} bounds={bounds} onMonth={changeMonth} onToday={() => goTo(today)} />
            <Weekdays />
            {view === "dia" ? (
              <div className="grid grid-cols-7 gap-1">
                {cells.map((date, index) => {
                  if (!date) return <div key={`empty-${index}`} className="min-h-16 rounded-2xl bg-day-empty sm:min-h-24" />;
                  const { total, soldOnly } = countsFor(date);
                  const entries = entriesFor(date);
                  const uniqueTitles = [...new Set(entries.map(({ item }) => item.title))];
                  const houseIds = [...new Set(entries.map(({ item }) => item.venue))];
                  const isSelected = date === selected;
                  const isToday = date === today;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelected(date)}
                      aria-pressed={isSelected}
                      aria-label={`${formatLongDate(date)}, ${total} ${total === 1 ? "sessão" : "sessões"}`}
                      className={`flex min-h-16 flex-col rounded-2xl px-1.5 py-1.5 text-left transition sm:min-h-24 sm:px-2 sm:py-2 ${
                        isSelected ? "bg-day-selected text-day-selected-ink" : "bg-day hover:bg-day-hover"
                      } ${isToday && !isSelected ? "ring-2 ring-[#e25a2a] ring-inset" : ""}`}
                    >
                      <span className="flex items-center justify-between">
                        <span className="text-sm font-medium">{Number(date.slice(-2))}</span>
                        {total > 0 && (
                          <span className="flex gap-0.5">
                            {houseIds.map((id) => (
                              <span key={id} className={`size-1.5 rounded-full ${soldOnly ? "bg-[#8d2430]" : VENUES[id].dot}`} />
                            ))}
                          </span>
                        )}
                      </span>
                      {uniqueTitles.length > 0 && (
                        <span className={`mt-1 hidden text-[11px] leading-tight sm:line-clamp-3 ${isSelected ? "text-day-selected-muted" : "text-paper-muted"}`}>
                          {uniqueTitles.slice(0, 2).join(" · ")}
                          {uniqueTitles.length > 2 ? ` +${uniqueTitles.length - 2}` : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {cells.map((date, index) => (
                  <FullDay
                    key={date || `empty-${index}`}
                    date={date}
                    today={today}
                    selected={selected}
                    entries={date ? entriesFor(date) : []}
                    onSelect={setSelected}
                    onOpen={setOpenId}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <div>
              <p className="text-xs tracking-[0.18em] text-gold uppercase">{houseLabel}</p>
              <h2 className="font-serif text-3xl text-ink">{formatLongDate(selected)}</h2>
            </div>
            <DaySchedule entries={dayEntries} onOpen={setOpenId} />
          </section>
        </div>
      )}

      {spansThisMonth.length > 0 && (
        <section>
          <h2 className="font-serif text-2xl text-ink">Em cartaz no período</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {spansThisMonth.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(item.id)}
                  className="w-full rounded-[22px] border border-line bg-card px-4 py-3 text-left hover:border-gold-line"
                >
                  <span className="font-serif text-lg text-card-ink">{item.title}</span>
                  <span className="mt-1 block text-sm text-card-muted">
                    {item.span?.label}
                    {item.online ? " · online" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-faint">
        {VENUE_LIST.map((place) => (
          <Legend key={place.id} swatch={place.dot} label={place.name} />
        ))}
        <Legend swatch="bg-[#1e6b45]" label="Disponível" />
        <Legend swatch="bg-[#c9893a]" label="Só na bilheteria" />
        <Legend swatch="bg-[#8d2430]" label="Esgotado" />
        <Legend swatch="bg-[#2f5f99]" label="Grátis" />
      </footer>

      {openItem && <FilmSheet item={openItem} onClose={() => setOpenId(null)} onPickDate={goTo} />}
    </div>
  );
}

function MonthNav({
  month,
  bounds,
  onMonth,
  onToday,
  plain = false,
}: {
  month: string;
  bounds: { min: string; max: string };
  onMonth: (month: string) => void;
  onToday: () => void;
  plain?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${plain ? "" : "mb-5"}`}>
      <button
        type="button"
        onClick={() => onMonth(shiftMonth(month, -1))}
        disabled={month <= bounds.min}
        className="rounded-full px-3 py-2 text-sm disabled:opacity-30"
        aria-label="Mês anterior"
      >
        ←
      </button>
      <div className="text-center">
        <h2 className="font-serif text-3xl capitalize">{monthLabel(month)}</h2>
        <button type="button" onClick={onToday} className="mt-1 text-xs tracking-wide text-gold-deep uppercase">
          Ir para hoje
        </button>
      </div>
      <button
        type="button"
        onClick={() => onMonth(shiftMonth(month, 1))}
        disabled={month >= bounds.max}
        className="rounded-full px-3 py-2 text-sm disabled:opacity-30"
        aria-label="Próximo mês"
      >
        →
      </button>
    </div>
  );
}

function Weekdays() {
  return (
    <div className="grid grid-cols-7 gap-1 text-center text-[11px] tracking-[0.16em] text-paper-faint uppercase">
      {WEEKDAYS.map((day) => (
        <div key={day} className="py-2">
          {day}
        </div>
      ))}
    </div>
  );
}

function FullDay({
  date,
  today,
  selected,
  entries,
  onSelect,
  onOpen,
}: {
  date: string;
  today: string;
  selected: string;
  entries: Screening[];
  onSelect: (date: string) => void;
  onOpen: (id: string) => void;
}) {
  if (!date) return <div className="min-h-16 rounded-2xl bg-day-empty sm:min-h-40" />;
  const isSelected = date === selected;
  const isToday = date === today;
  const shown = entries.slice(0, FULL_DAY_LINES);
  const hidden = entries.length - shown.length;
  const quiet = isSelected ? "text-day-selected-muted" : "text-paper-muted";

  return (
    <div
      className={`flex min-h-16 flex-col rounded-2xl px-1 py-1 sm:min-h-40 sm:px-1.5 sm:py-1.5 ${
        isSelected ? "bg-day-selected text-day-selected-ink" : "bg-day"
      } ${isToday && !isSelected ? "ring-2 ring-[#e25a2a] ring-inset" : ""}`}
    >
      <button
        type="button"
        onClick={() => onSelect(date)}
        aria-pressed={isSelected}
        aria-label={`${formatLongDate(date)}, ${entries.length} ${entries.length === 1 ? "sessão" : "sessões"}`}
        className="px-0.5 text-left text-sm font-medium"
      >
        {Number(date.slice(-2))}
        {entries.length > 0 && <span className={`ml-1 text-[11px] font-normal sm:hidden ${quiet}`}>{entries.length}</span>}
      </button>
      <ul className="mt-1 hidden min-h-0 flex-col gap-0.5 sm:flex">
        {shown.map(({ item, session }) => {
          const closed = session.availability === "soldout" || session.availability === "cancelled";
          return (
            <li key={`${item.id}-${session.id}`}>
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                title={`${session.time || "Dia"} ${item.title}`}
                className="flex w-full items-center gap-1 text-left text-[11px] leading-tight"
              >
                <span className={`size-1.5 shrink-0 rounded-full ${VENUES[item.venue].dot}`} />
                <span className={`shrink-0 tabular-nums ${quiet}`}>{session.time || "—"}</span>
                <span className={`truncate ${closed ? "line-through opacity-70" : ""}`}>{item.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button type="button" onClick={() => onSelect(date)} className={`mt-0.5 hidden px-0.5 text-left text-[11px] sm:block ${quiet}`}>
          +{hidden}
        </button>
      )}
    </div>
  );
}

function Agenda({ days, onOpen }: { days: { date: string; entries: Screening[] }[]; onOpen: (id: string) => void }) {
  if (days.length === 0) {
    return <p className="rounded-[28px] border border-dashed border-line px-5 py-10 text-muted">Nenhuma sessão neste mês.</p>;
  }
  return (
    <div className="flex flex-col gap-8">
      {days.map(({ date, entries }) => (
        <section key={date}>
          <h2 className="font-serif text-2xl text-ink">{formatLongDate(date)}</h2>
          <div className="mt-3">
            <DaySchedule entries={entries} onOpen={onOpen} />
          </div>
        </section>
      ))}
    </div>
  );
}

function DaySchedule({ entries, onOpen }: { entries: Screening[]; onOpen: (id: string) => void }) {
  if (entries.length === 0) {
    return <p className="rounded-[28px] border border-dashed border-line px-5 py-10 text-muted">Nenhuma sessão neste dia.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {entries.map(({ item, session }) => (
        <li key={`${item.id}-${session.id}`}>
          <SessionCard item={item} session={session} onOpen={() => onOpen(item.id)} />
        </li>
      ))}
    </ul>
  );
}

function SessionCard({ item, session, onOpen }: { item: ProgramItem; session: Session; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-[88px_1fr] gap-3 rounded-[24px] border border-line bg-card p-3 text-left transition hover:bg-card-hover sm:grid-cols-[104px_1fr]"
    >
      <Poster src={item.image} alt="" />
      <span className="min-w-0">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-serif text-2xl text-card-ink">{session.time || "—"}</span>
          {showsStatus(session) ? (
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass(session.availability)}`}>
              {AVAILABILITY_LABEL[session.availability]}
            </span>
          ) : (
            <span />
          )}
        </span>
        <span className="mt-1 block truncate font-serif text-lg text-card-ink">{item.title}</span>
        <span className="mt-0.5 block truncate text-sm text-card-muted">
          {placeLine(item.venue, item.room)}
          {item.subtitle ? ` · ${item.subtitle}` : ""}
        </span>
        <span className="mt-2 block text-xs text-card-faint">
          {[ticketLine(session), priceLine(session), session.endTime ? `até ${session.endTime}` : null].filter(Boolean).join(" · ")}
        </span>
        {session.saleOpensAt && (
          <span className="mt-1 block text-xs text-gold">Vendas a partir de {formatSaleOpening(session.saleOpensAt)}</span>
        )}
      </span>
    </button>
  );
}

function VenueAlert({
  warnings: venueWarnings,
  refreshing,
  onUpdate,
}: {
  warnings: VenueWarning[];
  refreshing: boolean;
  onUpdate: () => void;
}) {
  const id = venueWarnings[0]?.venue;
  if (!id) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-line bg-warning px-4 py-3 text-sm text-warning-ink">
      <div>
        {venueWarnings.map((warning) => (
          <p key={warning.message}>{warning.message}</p>
        ))}
      </div>
      <button
        type="button"
        onClick={onUpdate}
        disabled={refreshing}
        className="rounded-full bg-pressed px-3 py-1.5 text-sm text-pressed-ink disabled:opacity-50"
      >
        {refreshing ? "Atualizando…" : `Atualizar ${VENUES[id].name}`}
      </button>
    </div>
  );
}

function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
        pressed ? "bg-pressed text-pressed-ink" : "bg-chip text-chip-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`size-2 rounded-full ${swatch}`} />
      {label}
    </span>
  );
}

function Poster({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return <span className="block aspect-[2/1] rounded-2xl bg-poster" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="aspect-[2/1] w-full rounded-2xl object-cover" />
  );
}

function FilmSheet({
  item,
  onClose,
  onPickDate,
}: {
  item: ProgramItem;
  onClose: () => void;
  onPickDate: (date: string) => void;
}) {
  const buyUrl = item.sessions.find(
    (session) => session.purchaseUrl && session.availability === "available",
  )?.purchaseUrl;

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-overlay p-3 sm:items-center" role="presentation" onClick={onClose}>
      <article
        role="dialog"
        aria-modal="true"
        aria-labelledby="film-title"
        className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-[28px] bg-paper p-5 text-paper-ink shadow-2xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs tracking-[0.18em] text-gold-deep uppercase">{item.kind === "span" ? "No período" : "Todas as sessões"}</p>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm" aria-label="Fechar">
            Fechar
          </button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">
          <Poster src={item.image} alt={item.title} />
          <div>
            <h3 id="film-title" className="font-serif text-4xl leading-none">
              {item.title}
            </h3>
            {item.subtitle && <p className="mt-2 text-paper-muted">{item.subtitle}</p>}
            <p className="mt-3 text-sm text-paper-muted">{placeLine(item.venue, item.room)}</p>
            <p className="mt-1 text-sm text-paper-muted">{VENUES[item.venue].address}</p>
            {[item.age, ...item.tags].filter(Boolean).length > 0 && (
              <p className="mt-3 text-sm text-paper-muted">{[item.age, ...item.tags].filter(Boolean).join(" · ")}</p>
            )}
          </div>
        </div>

        {item.kind === "span" && item.span && (
          <p className="mt-6 text-lg">
            {item.span.label}
            {item.online ? " · atividade online" : ""}
          </p>
        )}

        {item.sessions.length > 0 && (
          <ul className="mt-6 divide-y divide-paper-line">
            {item.sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <button type="button" onClick={() => { onPickDate(session.date); onClose(); }} className="text-left">
                  <span className="block font-serif text-xl">
                    {formatLongDate(session.date)}
                    {session.time ? ` · ${session.time}` : ""}
                    {session.endTime ? `–${session.endTime}` : ""}
                  </span>
                  <span className="text-sm text-paper-muted">{[ticketLine(session), priceLine(session)].filter(Boolean).join(" · ")}</span>
                </button>
                {showsStatus(session) ? (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass(session.availability)}`}>
                    {AVAILABILITY_LABEL[session.availability]}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <a href={item.href} target="_blank" rel="noopener noreferrer" className="rounded-full bg-day-selected px-4 py-2 text-sm text-day-selected-ink">
            {VENUES[item.venue].pageLabel}
          </a>
          {item.watchUrl && (
            <a href={item.watchUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-paper-line px-4 py-2 text-sm">
              Assistir
            </a>
          )}
          {buyUrl && (
            <a href={buyUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-paper-line px-4 py-2 text-sm">
              Comprar ingresso
            </a>
          )}
        </div>
      </article>
    </div>
  );
}
