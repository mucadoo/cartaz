import { ThemeToggle } from "@/components/theme-toggle";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="h-4 w-28 rounded-full bg-chip" />
          <div className="h-16 w-72 rounded-2xl bg-chip" />
          <div className="h-5 w-full max-w-lg rounded-full bg-chip" />
        </div>
        <ThemeToggle />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="h-[520px] rounded-[28px] bg-paper" />
        <div className="space-y-3">
          <div className="h-10 w-56 rounded-2xl bg-chip" />
          <div className="h-28 rounded-[24px] border border-line bg-card" />
          <div className="h-28 rounded-[24px] border border-line bg-card" />
          <div className="h-28 rounded-[24px] border border-line bg-card" />
        </div>
      </div>
      <p className="text-sm text-faint">Buscando a programação…</p>
    </main>
  );
}
