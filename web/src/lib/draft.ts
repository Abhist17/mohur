"use client";

/** The index the user designs on Create and launches on Launch (per-viewer convenience: localStorage). */
export type Draft = { weights: Record<string, number> }; // symbol -> percent (sums to 100; 0 = excluded)

export const DEFAULT_DRAFT: Draft = { weights: { tWETH: 40, tWBTC: 30, tUSDC: 30 } };

export function loadDraft(): Draft {
  try {
    const s = localStorage.getItem("tenbin.draft");
    if (s) return JSON.parse(s);
  } catch {}
  return DEFAULT_DRAFT;
}

export function saveDraft(d: Draft) {
  try {
    localStorage.setItem("tenbin.draft", JSON.stringify(d));
  } catch {}
}

/** Change one weight and rescale the others so the total stays exactly 100. */
export function setWeight(w: Record<string, number>, sym: string, v: number): Record<string, number> {
  const others = Object.keys(w).filter((k) => k !== sym && w[k] > 0);
  v = Math.max(others.length ? 1 : 100, Math.min(100 - others.length, Math.round(v)));
  const rest = 100 - v;
  const otherSum = others.reduce((a, k) => a + w[k], 0) || 1;
  const out: Record<string, number> = { ...w, [sym]: v };
  let acc = 0;
  others.forEach((k, i) => {
    const nv = i === others.length - 1 ? rest - acc : Math.max(1, Math.round((w[k] / otherSum) * rest));
    out[k] = nv;
    acc += nv;
  });
  return out;
}
