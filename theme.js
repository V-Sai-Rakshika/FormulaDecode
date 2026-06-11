/**
 * FormulaDecode — Theme Switcher
 * ──────────────────────────────
 * Themes: aurora | autumn | sakura | velvet | cosmic | ocean
 *
 * Usage:
 *   import { setTheme, getTheme, initTheme } from './theme-switcher.js';
 *
 *   initTheme();          // on page load — restores saved theme
 *   setTheme('velvet');   // switch to any theme
 *   getTheme();           // → 'velvet'
 */

const THEMES = ["aurora", "autumn", "sakura", "velvet", "cosmic", "ocean"];
const STORAGE_KEY = "fd-theme";
const DEFAULT_THEME = "aurora";

/**
 * Apply a theme by setting data-theme on <html>.
 * Aurora is the default (:root) — no attribute needed.
 */
export function setTheme(name) {
  if (!THEMES.includes(name)) {
    console.warn(
      `[FormulaDecode] Unknown theme "${name}". Valid: ${THEMES.join(", ")}`,
    );
    return;
  }
  const root = document.documentElement;
  if (name === DEFAULT_THEME) {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", name);
  }
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch (_) {
    /* private browsing */
  }
  document.dispatchEvent(
    new CustomEvent("fd:themechange", { detail: { theme: name } }),
  );
}

/** Returns the currently active theme name. */
export function getTheme() {
  return document.documentElement.getAttribute("data-theme") || DEFAULT_THEME;
}

/**
 * Call once on page load. Reads localStorage and applies the saved theme.
 * Falls back to DEFAULT_THEME if nothing is stored.
 */
export function initTheme() {
  let saved = DEFAULT_THEME;
  try {
    saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  } catch (_) {
    /* ignore */
  }
  setTheme(THEMES.includes(saved) ? saved : DEFAULT_THEME);
}

/**
 * Build a minimal theme toggle UI and append it to a container.
 * Pass a selector string or a DOM element.
 *
 * Example:
 *   buildThemePicker('#theme-picker');
 */
export function buildThemePicker(containerOrSelector) {
  const container =
    typeof containerOrSelector === "string"
      ? document.querySelector(containerOrSelector)
      : containerOrSelector;

  if (!container) return;

  const labels = {
    aurora: "⚡ Aurora Tech",
    autumn: "🍂 Autumn Scholar",
    sakura: "🌸 Sakura Bloom",
    velvet: "✦  Velvet Luxury",
    cosmic: "🔮 Cosmic Purple",
    ocean: "🌊 Ocean Glass",
  };

  container.innerHTML = THEMES.map(
    (t) => `
    <button
      class="fd-theme-btn"
      data-theme-pick="${t}"
      aria-label="Switch to ${labels[t]} theme"
    >${labels[t]}</button>
  `,
  ).join("");

  function refresh() {
    const current = getTheme();
    container.querySelectorAll(".fd-theme-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.themePick === current);
    });
  }

  container.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-pick]");
    if (btn) setTheme(btn.dataset.themePick);
  });

  document.addEventListener("fd:themechange", refresh);
  refresh();
}
