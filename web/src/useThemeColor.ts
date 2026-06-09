import { useEffect } from "react";

/** The app's warm-cream background — keep in sync with index.css / manifest.webmanifest. */
export const THEME_BG = "#f3ebd5";

/**
 * Tint the browser chrome (Safari's top/URL bar via `theme-color`) to match
 * the page, restoring the cream default when the page unmounts.
 */
export function useThemeColor(hex: string | undefined): void {
  useEffect(() => {
    if (!hex) return;
    // There's one meta per appearance mode (plus a fallback) — keep them in step.
    const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
    if (metas.length === 0) return;
    metas.forEach((m) => (m.content = hex));
    return () => {
      metas.forEach((m) => (m.content = THEME_BG));
    };
  }, [hex]);
}
