import React from "react";

// Lightweight Python-ish syntax highlight for example blocks (from the design).
export function highlightPy(code: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /("[^"]*"|\b(?:print|def|if|else|for|in|return|True|False|None)\b|→|[0-9]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(<span key={k++}>{code.slice(last, m.index)}</span>);
    const tok = m[0];
    let color = "#27764b";
    if (tok[0] === '"') color = "#d34c24";
    else if (/^[0-9]+$/.test(tok)) color = "#5c6bcb";
    else if (tok === "→") color = "#aaaaa5";
    out.push(
      <span key={k++} style={{ color }}>
        {tok}
      </span>,
    );
    last = re.lastIndex;
  }
  if (last < code.length) out.push(<span key={k++}>{code.slice(last)}</span>);
  return out;
}
