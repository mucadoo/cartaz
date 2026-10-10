import type { VenueId } from "@/lib/types";

export type Venue = {
  id: VenueId;
  name: string;
  address: string;
  href: string;
  pageLabel: string;
  dot: string;
  hours?: string;
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
  masp: {
    id: "masp",
    name: "MASP",
    address: "Avenida Paulista, 1578 · Bela Vista",
    href: "https://masp.org.br/exposicoes",
    pageLabel: "Página do MASP",
    dot: "bg-[#d0121a]",
    hours: "Terça 10h–20h, grátis. Quarta e quinta 10h–18h. Sexta 10h–21h, grátis a partir das 18h. Sábado e domingo 10h–18h. Fechado segunda.",
  },
  mis: {
    id: "mis",
    name: "MIS",
    address: "Avenida Europa, 158 · Jardim Europa",
    href: "https://mis-sp.org.br/exposicao/",
    pageLabel: "Página do MIS",
    dot: "bg-[#6b4c9a]",
    hours: "Terça a sexta, 10h–19h. Sábado, 10h–20h. Domingo e feriado, 10h–18h.",
  },
  itau: {
    id: "itau",
    name: "Itaú Cultural",
    address: "Avenida Paulista, 149 · Bela Vista",
    href: "https://www.itaucultural.org.br/agenda",
    pageLabel: "Página do Itaú Cultural",
    dot: "bg-[#e07a2f]",
    hours: "Terça a sábado, 11h–20h. Domingo e feriado, 11h–19h. Entrada gratuita.",
  },
  pinacoteca: {
    id: "pinacoteca",
    name: "Pinacoteca",
    address: "Pina Luz, Praça da Luz, 2 · Pina Estação, Largo General Osório, 66 · Pina Contemporânea, Avenida Tiradentes, 273",
    href: "https://pinacoteca.org.br/programacao/tipo/exposicoes/",
    pageLabel: "Página da Pinacoteca",
    dot: "bg-[#243e73]",
    hours: "Quarta a segunda, 10h–18h. Entrada até 17h. Fechado terça.",
  },
  mam: {
    id: "mam",
    name: "MAM",
    address: "Avenida Pedro Álvares Cabral, s/n · Parque Ibirapuera",
    href: "https://mam.org.br/exposicoes/em-cartaz/",
    pageLabel: "Página do MAM",
    dot: "bg-[#5c6b2f]",
    hours: "Terça a domingo, 10h–18h, entrada até 17h30. Fechado segunda. Ingresso R$ 40, meia R$ 20, mais taxa. Domingo grátis.",
  },
  tomie: {
    id: "tomie",
    name: "Instituto Tomie Ohtake",
    address: "Rua Coropés, 88 · Pinheiros",
    href: "https://www.institutotomieohtake.org.br/programacao/exposicoes",
    pageLabel: "Página do Tomie Ohtake",
    dot: "bg-[#c73e78]",
  },
  ccbb: {
    id: "ccbb",
    name: "CCBB",
    address: "Rua Álvares Penteado, 112 · Centro",
    href: "https://ccbb.com.br/sao-paulo/programacao/",
    pageLabel: "Página do CCBB",
    dot: "bg-[#0c4da2]",
    hours: "Todos os dias, exceto terça, 9h–20h.",
  },
  afro: {
    id: "afro",
    name: "Museu Afro Brasil",
    address: "Parque Ibirapuera, Portão 10 · Pavilhão Padre Manoel da Nóbrega",
    href: "https://museuafrobrasil.org.br/exposicoes/",
    pageLabel: "Página do Museu Afro Brasil",
    dot: "bg-[#8a2f5a]",
    hours: "Terça a domingo, 10h–17h. Permanência até 18h.",
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
  VENUES.masp,
  VENUES.mis,
  VENUES.itau,
  VENUES.pinacoteca,
  VENUES.mam,
  VENUES.tomie,
  VENUES.ccbb,
  VENUES.afro,
];

export function placeLine(venue: VenueId, room: string | null): string {
  const name = VENUES[venue].name;
  if (!room || room.toLowerCase() === name.toLowerCase()) return name;
  return `${name} · ${room}`;
}
