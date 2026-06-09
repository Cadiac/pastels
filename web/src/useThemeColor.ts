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
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    meta.content = hex;
    return () => {
      meta.content = THEME_BG;
    };
  }, [hex]);
}
