"use client";

import { ThemeToggle } from "@/components/theme-toggle";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs tracking-[0.2em] text-gold uppercase">Cartaz</p>
        <ThemeToggle />
      </div>
      <h1 className="font-serif text-5xl text-ink">A programação não carregou</h1>
      <p className="text-muted">As casas não responderam agora. Vale tentar de novo em instantes.</p>
      <button type="button" onClick={reset} className="w-fit rounded-full bg-pressed px-4 py-2 text-sm text-pressed-ink">
        Tentar de novo
      </button>
    </main>
  );
}
