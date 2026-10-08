export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="space-y-3">
        <div className="h-4 w-28 rounded-full bg-[#2a1b14]" />
        <div className="h-16 w-72 rounded-2xl bg-[#2a1b14]" />
        <div className="h-5 w-full max-w-lg rounded-full bg-[#2a1b14]" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="h-[520px] rounded-[28px] bg-[#f4ead8]/90" />
        <div className="space-y-3">
          <div className="h-10 w-56 rounded-2xl bg-[#2a1b14]" />
          <div className="h-28 rounded-[24px] bg-[#24160f]" />
          <div className="h-28 rounded-[24px] bg-[#24160f]" />
          <div className="h-28 rounded-[24px] bg-[#24160f]" />
        </div>
      </div>
      <p className="text-sm text-[#b5a08e]">Buscando a programação…</p>
    </main>
  );
}
