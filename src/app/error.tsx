"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6">
      <p className="text-xs tracking-[0.2em] text-[#e4b15a] uppercase">Cartaz</p>
      <h1 className="font-serif text-5xl text-[#f6efe4]">A programação não carregou</h1>
      <p className="text-[#d9c7b2]">As casas não responderam agora. Vale tentar de novo em instantes.</p>
      <button type="button" onClick={reset} className="w-fit rounded-full bg-[#f4ead8] px-4 py-2 text-sm text-[#1c120d]">
        Tentar de novo
      </button>
    </main>
  );
}
