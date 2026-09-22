// utils.js - small helpers shared by the popup and the page scripts.

window.RSU = (() => {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Turn "2026-10-05" into "05-Oct-2026" or "05/10/2026".
  function formatDate(iso, style) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return "";
    const [, y, mo, d] = m;
    if (style === "DD/MM/YYYY") return `${d}/${mo}/${y}`;
    return `${d}-${MONTHS[Number(mo) - 1]}-${y}`;
  }

  // Keep checking until fn() returns something truthy, or time runs out.
  async function waitFor(fn, timeoutMs = 8000, everyMs = 200) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(everyMs);
    }
    return null;
  }

  const visible = (el) =>
    !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";

  // Random whole number between min and max: used for human-like pauses.
  const jitter = (min, max) => Math.round(min + Math.random() * (max - min));

  // Whole seconds -> "M:SS" or "H:MM:SS". Used by the scheduler countdown
  // and the retry countdown in the status box.
  function fmtDuration(ms) {
    let s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    const mm = String(m).padStart(h ? 2 : 1, "0");
    const ss = String(s).padStart(2, "0");
    return h ? `${h}:${mm.padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
  }

  // Text that looks like a clock, e.g. "03:41" or "1:02:03". Used to spot a
  // countdown element without knowing its class name in advance.
  const looksLikeClock = (text) => /\b\d{1,2}:\d{2}(:\d{2})?\b/.test(String(text || ""));

  // Lowercase, trim, collapse spaces.
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

  return { sleep, formatDate, waitFor, visible, jitter, norm, fmtDuration, looksLikeClock };
})();
