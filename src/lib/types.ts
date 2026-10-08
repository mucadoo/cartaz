export type VenueId =
  | "cinesesc"
  | "cinemateca"
  | "belas-artes"
  | "petrobras"
  | "cinusp"
  | "sala-sp"
  | "municipal"
  | "baccarelli"
  | "sao-pedro";

export type Availability = "available" | "boxoffice" | "soldout" | "cancelled" | "free";

export type Prices = {
  full: number | null;
  half: number | null;
  credential: number | null;
};

export type Session = {
  id: string;
  date: string;
  time: string;
  endTime: string | null;
  webTickets: number | null;
  boxOfficeTickets: number | null;
  availability: Availability;
  saleOpensAt: string | null;
  purchaseUrl: string | null;
  prices: Prices | null;
  priceLabel: string | null;
};

export type ProgramItem = {
  id: string;
  venue: VenueId;
  room: string | null;
  title: string;
  subtitle: string | null;
  image: string | null;
  href: string;
  age: string | null;
  tags: string[];
  kind: "screening" | "span";
  span: { start: string; end: string; label: string } | null;
  sessions: Session[];
  online: boolean;
  watchUrl: string | null;
};

export type Program = {
  items: ProgramItem[];
  updatedAt: string;
  warnings: string[];
};
