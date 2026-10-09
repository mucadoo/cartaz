"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const current: Theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const next: Theme = current === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("cartaz-theme", next);
    setTheme(next);
  }

  const goingLight = theme !== "light";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={goingLight ? "Usar tema claro" : "Usar tema escuro"}
      className="rounded-full border border-gold-line px-3 py-1.5 text-sm text-ink"
    >
      {goingLight ? "Claro" : "Escuro"}
    </button>
  );
}
