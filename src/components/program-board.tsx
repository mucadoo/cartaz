"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  WEEKDAYS,
  brl,
  formatLongDate,
  formatSaleOpening,
  formatUpdatedAt,
  monthGrid,
  monthLabel,
  shiftMonth,
} from "@/lib/dates";
import { screeningsOn } from "@/lib/schedule";
import type { Availability, Program, ProgramItem, Session, VenueId } from "@/lib/types";
import { placeLine, VENUE_LIST, VENUES } from "@/lib/venues";

type Filter = "all" | "open";
type VenueFilter = "all" | VenueId;

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
  const [venue, setVenue] = useState<VenueFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const visibleItems = useMemo(
    () => (venue === "all" ? program.items : program.items.filter((item) => item.venue === venue)),
    [program.items, venue],
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="grid gap-6 border-b border-[#e7d3b0]/30 pb-8 md:grid-cols-[1.4fr_0.8fr] md:items-end">
        <div>
          <p className="font-serif text-sm tracking-[0.28em] text-[#e4b15a] uppercase">Cartaz</p>
          <h1 className="mt-3 font-serif text-5xl leading-none text-[#f6efe4] sm:text-7xl">Programação</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[#d9c7b2] sm:text-lg">
            CineSesc, Cinemateca, Cine Belas Artes, Espaço Petrobras, CINUSP, Sala São Paulo, Theatro Municipal, Teatro Baccarelli e Theatro São Pedro no mesmo calendário.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <div className="flex flex-wrap gap-2">
            {VENUE_LIST.map((place) => (
              <a
                key={place.id}
                href={place.href}
                className="inline-flex items-center gap-2 rounded-full border border-[#e4b15a]/50 px-4 py-2 text-sm text-[#f6efe4] transition hover:bg-[#e4b15a] hover:text-[#1a100c]"
              >
                {place.name}
              </a>
            ))}
          </div>
          <p className="text-sm text-[#b5a08e]">Atualizado {formatUpdatedAt(program.updatedAt)}</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Casa">
        <FilterChip pressed={venue === "all"} onClick={() => setVenue("all")}>
          Todas
        </FilterChip>
        {VENUE_LIST.map((place) => (
          <FilterChip key={place.id} pressed={venue === place.id} onClick={() => setVenue(place.id)}>
            <span className={`size-1.5 rounded-full ${place.dot}`} />
            {place.name}
          </FilterChip>
        ))}
      </div>

      {program.warnings.length > 0 && (
        <div className="rounded-2xl border border-[#e4b15a]/30 bg-[#2a1b14] px-4 py-3 text-sm text-[#f0d7b0]">
          {program.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="rounded-[28px] bg-[#f4ead8] p-4 text-[#1c120d] shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setMonth((current) => shiftMonth(current, -1))}
              disabled={month <= bounds.min}
              className="rounded-full px-3 py-2 text-sm disabled:opacity-30"
              aria-label="Mês anterior"
            >
              ←
            </button>
            <div className="text-center">
              <h2 className="font-serif text-3xl capitalize">{monthLabel(month)}</h2>
              <button type="button" onClick={() => goTo(today)} className="mt-1 text-xs tracking-wide text-[#8a5a12] uppercase">
                Ir para hoje
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMonth((current) => shiftMonth(current, 1))}
              disabled={month >= bounds.max}
              className="rounded-full px-3 py-2 text-sm disabled:opacity-30"
              aria-label="Próximo mês"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] tracking-[0.16em] text-[#8d7768] uppercase">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((date, index) => {
              if (!date) return <div key={`empty-${index}`} className="min-h-16 rounded-2xl bg-[#eadcc4]/50 sm:min-h-24" />;
              const { total, soldOnly } = countsFor(date);
              const entries = entriesFor(date);
              const uniqueTitles = [...new Set(entries.map(({ item }) => item.title))];
              const venues = [...new Set(entries.map(({ item }) => item.venue))];
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
                    isSelected ? "bg-[#1c120d] text-[#f6efe4]" : "bg-[#fbf6ec] hover:bg-white"
                  } ${isToday && !isSelected ? "ring-2 ring-[#e25a2a] ring-inset" : ""}`}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-medium">{Number(date.slice(-2))}</span>
                    {total > 0 && (
                      <span className="flex gap-0.5">
                        {venues.map((id) => (
                          <span key={id} className={`size-1.5 rounded-full ${soldOnly ? "bg-[#8d2430]" : VENUES[id].dot}`} />
                        ))}
                      </span>
                    )}
                  </span>
                  {uniqueTitles.length > 0 && (
                    <span className={`mt-1 hidden text-[11px] leading-tight sm:line-clamp-3 ${isSelected ? "text-[#f0d7b0]" : "text-[#5c4638]"}`}>
                      {uniqueTitles.slice(0, 2).join(" · ")}
                      {uniqueTitles.length > 2 ? ` +${uniqueTitles.length - 2}` : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.18em] text-[#e4b15a] uppercase">{venue === "all" ? "No dia" : VENUES[venue].name}</p>
              <h2 className="font-serif text-3xl text-[#f6efe4]">{formatLongDate(selected)}</h2>
            </div>
            <div className="flex rounded-full bg-[#2a1b14] p-1 text-sm">
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
                  className={`rounded-full px-3 py-1.5 ${filter === value ? "bg-[#f4ead8] text-[#1c120d]" : "text-[#d9c7b2]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {dayEntries.length === 0 ? (
            <p className="rounded-[28px] border border-dashed border-[#e7d3b0]/30 px-5 py-10 text-[#d9c7b2]">
              Nenhuma sessão neste dia.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {dayEntries.map(({ item, session }) => (
                <li key={`${item.id}-${session.id}`}>
                  <button
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className="grid w-full grid-cols-[88px_1fr] gap-3 rounded-[24px] bg-[#24160f] p-3 text-left transition hover:bg-[#2e1d14] sm:grid-cols-[104px_1fr]"
                  >
                    <Poster src={item.image} alt="" />
                    <span className="min-w-0">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-serif text-2xl text-[#f6efe4]">{session.time || "—"}</span>
                        {showsStatus(session) ? (
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass(session.availability)}`}>
                            {AVAILABILITY_LABEL[session.availability]}
                          </span>
                        ) : (
                          <span />
                        )}
                      </span>
                      <span className="mt-1 block truncate font-serif text-lg text-[#f6efe4]">{item.title}</span>
                      <span className="mt-0.5 block truncate text-sm text-[#b5a08e]">
                        {placeLine(item.venue, item.room)}
                        {item.subtitle ? ` · ${item.subtitle}` : ""}
                      </span>
                      <span className="mt-2 block text-xs text-[#d9c7b2]">
                        {[ticketLine(session), priceLine(session), session.endTime ? `até ${session.endTime}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {session.saleOpensAt && (
                        <span className="mt-1 block text-xs text-[#e4b15a]">Vendas a partir de {formatSaleOpening(session.saleOpensAt)}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

        </section>
      </div>

      {spansThisMonth.length > 0 && (
        <section>
          <h2 className="font-serif text-2xl text-[#f6efe4]">Em cartaz no período</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {spansThisMonth.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(item.id)}
                  className="w-full rounded-[22px] border border-[#e7d3b0]/20 px-4 py-3 text-left hover:border-[#e4b15a]/50"
                >
                  <span className="font-serif text-lg text-[#f6efe4]">{item.title}</span>
                  <span className="mt-1 block text-sm text-[#b5a08e]">
                    {item.span?.label}
                    {item.online ? " · online" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#8d7768]">
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
        pressed ? "bg-[#f4ead8] text-[#1c120d]" : "bg-[#2a1b14] text-[#d9c7b2]"
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
  if (!src) return <span className="block aspect-[2/1] rounded-2xl bg-[#3a271c]" />;
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
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-[#140c09]/70 p-3 sm:items-center" role="presentation" onClick={onClose}>
      <article
        role="dialog"
        aria-modal="true"
        aria-labelledby="film-title"
        className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-[28px] bg-[#f4ead8] p-5 text-[#1c120d] shadow-2xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs tracking-[0.18em] text-[#8a5a12] uppercase">{item.kind === "span" ? "No período" : "Todas as sessões"}</p>
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
            {item.subtitle && <p className="mt-2 text-[#5c4638]">{item.subtitle}</p>}
            <p className="mt-3 text-sm text-[#5c4638]">{placeLine(item.venue, item.room)}</p>
            <p className="mt-1 text-sm text-[#5c4638]">{VENUES[item.venue].address}</p>
            {[item.age, ...item.tags].filter(Boolean).length > 0 && (
              <p className="mt-3 text-sm text-[#5c4638]">{[item.age, ...item.tags].filter(Boolean).join(" · ")}</p>
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
          <ul className="mt-6 divide-y divide-[#e7d3b0]">
            {item.sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <button type="button" onClick={() => { onPickDate(session.date); onClose(); }} className="text-left">
                  <span className="block font-serif text-xl">
                    {formatLongDate(session.date)}
                    {session.time ? ` · ${session.time}` : ""}
                    {session.endTime ? `–${session.endTime}` : ""}
                  </span>
                  <span className="text-sm text-[#5c4638]">{[ticketLine(session), priceLine(session)].filter(Boolean).join(" · ")}</span>
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
          <a href={item.href} className="rounded-full bg-[#1c120d] px-4 py-2 text-sm text-[#f6efe4]">
            {VENUES[item.venue].pageLabel}
          </a>
          {item.watchUrl && (
            <a href={item.watchUrl} className="rounded-full border border-[#1c120d]/20 px-4 py-2 text-sm">
              Assistir
            </a>
          )}
          {buyUrl && (
            <a href={buyUrl} className="rounded-full border border-[#1c120d]/20 px-4 py-2 text-sm">
              Comprar ingresso
            </a>
          )}
        </div>
      </article>
    </div>
  );
}
