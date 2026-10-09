import { ProgramBoard } from "@/components/program-board";
import { initialSelectedDate } from "@/lib/schedule";
import { loadProgram } from "@/lib/program";
import { saoPauloToday } from "@/lib/dates";

/** Twice a day. A house with tickets still on sale is fetched every two hours, and that shortens this page to match. */
export const revalidate = 43200;
export const preferredRegion = "gru1";
export const maxDuration = 60;

export default async function Home() {
  const today = saoPauloToday();
  const program = await loadProgram();
  const selectedDate = initialSelectedDate(program.items, today);

  return (
    <main>
      <ProgramBoard program={program} today={today} selectedDate={selectedDate} />
    </main>
  );
}
