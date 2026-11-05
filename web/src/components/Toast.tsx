"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type ToastKind = "pending" | "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; title: string; body?: string; href?: string };
type Api = { push(t: Omit<Toast, "id">): number; update(id: number, t: Partial<Omit<Toast, "id">>): void; dismiss(id: number): void };

const Ctx = createContext<Api | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), []);
  const autoClose = useCallback((id: number, kind: ToastKind) => {
    if (kind === "success" || kind === "info") setTimeout(() => dismiss(id), 6000);
    if (kind === "error") setTimeout(() => dismiss(id), 10000);
  }, [dismiss]);
  const push = useCallback<Api["push"]>((t) => {
    const id = nextId++;
    setItems((x) => [...x.slice(-3), { ...t, id }]);
    autoClose(id, t.kind);
    return id;
  }, [autoClose]);
  const update = useCallback<Api["update"]>((id, t) => {
    setItems((x) => x.map((i) => (i.id === id ? { ...i, ...t } : i)));
    if (t.kind) autoClose(id, t.kind);
  }, [autoClose]);

  return (
    <Ctx.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="toast-icon">{t.kind === "pending" ? <span className="spinner" /> : t.kind === "success" ? "✓" : t.kind === "error" ? "!" : "i"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="toast-title">{t.title}</div>
              {t.body && <div className="toast-body">{t.body}</div>}
              {t.href && (
                <a className="toast-link" href={t.href} target="_blank" rel="noreferrer">
                  View transaction ↗
                </a>
              )}
            </div>
            <button className="toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ToastProvider missing");
  return v;
}
