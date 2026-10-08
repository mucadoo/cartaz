import type { VenueId } from "@/lib/types";

export type Venue = {
  id: VenueId;
  name: string;
  address: string;
  href: string;
  pageLabel: string;
  dot: string;
};

export const VENUES: Record<VenueId, Venue> = {
  cinesesc: {
    id: "cinesesc",
    name: "CineSesc",
    address: "Rua Augusta, 2075 · Cerqueira César",
    href: "https://www.sescsp.org.br/programacao/?id=52&unidade=CineSesc",
    pageLabel: "Página do Sesc",
    dot: "bg-[#c9893a]",
  },
  cinemateca: {
    id: "cinemateca",
    name: "Cinemateca",
    address: "Largo Senador Raul Cardoso, 207 · Vila Clementino",
    href: "https://cinemateca.org.br/programacao/",
    pageLabel: "Página da Cinemateca",
    dot: "bg-[#c4483a]",
  },
  "belas-artes": {
    id: "belas-artes",
    name: "Cine Belas Artes",
    address: "Rua da Consolação, 2423 · Consolação",
    href: "https://www.cinebelasartes.com.br/programacao-regular/",
    pageLabel: "Página do Belas Artes",
    dot: "bg-[#155488]",
  },
  petrobras: {
    id: "petrobras",
    name: "Espaço Petrobras",
    address: "Rua Augusta, 1475 · Consolação",
    href: "https://espacopetrobrasdecinema.com.br/",
    pageLabel: "Página do Petrobras",
    dot: "bg-[#00843d]",
  },
  cinusp: {
    id: "cinusp",
    name: "CINUSP",
    address: "Entrada franca",
    href: "https://cinusp.webhostusp.sti.usp.br/",
    pageLabel: "Página do CINUSP",
    dot: "bg-[#d4ad00]",
  },
  "sala-sp": {
    id: "sala-sp",
    name: "Sala São Paulo",
    address: "Praça Júlio Prestes, 16 · Campos Elíseos",
    href: "https://salasaopaulo.art.br/salasp/pt/programacao-ingressos",
    pageLabel: "Página da Sala",
    dot: "bg-[#3d6b8a]",
  },
  municipal: {
    id: "municipal",
    name: "Theatro Municipal",
    address: "Praça Ramos de Azevedo, s/n · Centro",
    href: "https://theatromunicipal.org.br/programacao/",
    pageLabel: "Página do Municipal",
    dot: "bg-[#7d4e7a]",
  },
  baccarelli: {
    id: "baccarelli",
    name: "Teatro Baccarelli",
    address: "Estrada das Lágrimas, 2317 · Heliópolis",
    href: "https://baccarelli.org.br/nucleos/teatro-baccarelli/#em-cartaz",
    pageLabel: "Página do Baccarelli",
    dot: "bg-[#2f7a62]",
  },
  "sao-pedro": {
    id: "sao-pedro",
    name: "Theatro São Pedro",
    address: "Rua Albuquerque Lins, 207 · Campos Elíseos",
    href: "https://theatrosaopedro.art.br/programacao/",
    pageLabel: "Página do São Pedro",
    dot: "bg-[#8f4d2a]",
  },
};

export const VENUE_LIST: Venue[] = [
  VENUES.cinesesc,
  VENUES.cinemateca,
  VENUES["belas-artes"],
  VENUES.petrobras,
  VENUES.cinusp,
  VENUES["sala-sp"],
  VENUES.municipal,
  VENUES.baccarelli,
  VENUES["sao-pedro"],
];

export function placeLine(venue: VenueId, room: string | null): string {
  const name = VENUES[venue].name;
  if (!room || room.toLowerCase() === name.toLowerCase()) return name;
  return `${name} · ${room}`;
}
