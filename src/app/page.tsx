import { ProgramBoard } from "@/components/program-board";
import { initialSelectedDate } from "@/lib/schedule";
import { loadProgram } from "@/lib/program";
import { saoPauloToday } from "@/lib/dates";

export const revalidate = 600;

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
