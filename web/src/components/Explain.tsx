import type { ReactNode } from "react";

const DOC = "https://github.com/Abhist17/mohur/blob/main/docs/explained.md";

/** Collapsed "How this page works" box: a few plain bullets, then a link to the matching section of docs/explained.md. */
export function Explain({ points, anchor, title = "How this page works" }: { points: ReactNode[]; anchor: string; title?: string }) {
  return (
    <details className="card more explain" style={{ marginTop: 24 }} data-testid="explain">
      <summary><h3>{title}</h3></summary>
      <ul className="explain-list">
        {points.map((p, i) => <li key={i}>{p}</li>)}
      </ul>
      <a href={`${DOC}#${anchor}`} target="_blank" rel="noreferrer" className="gold" style={{ fontSize: 13.5 }}>
        Full explanation with diagrams ↗
      </a>
    </details>
  );
}
