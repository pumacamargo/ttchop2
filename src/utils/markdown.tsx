import React from 'react';

// ── Minimal Markdown renderer for LLM-generated reports ─────────────────────
// Supports headings (#..######), bullet/numbered lists, **bold**, and
// paragraphs — the subset an LLM report realistically produces. Deliberately
// does NOT use dangerouslySetInnerHTML: every node below is a real React
// element built from parsed text, so there is no HTML-injection surface even
// though the source string comes from an LLM response.

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^[-*]\s+(.*)$/;
const OL_RE = /^\d+\.\s+(.*)$/;

const HEADING_SIZE: Record<number, string> = {
  1: '1.15rem',
  2: '1.05rem',
  3: '0.95rem',
  4: '0.88rem',
  5: '0.85rem',
  6: '0.82rem',
};

/** Splits a line of text on **bold** spans and returns real React nodes (no HTML parsing). */
function renderInline(text: string, keyPrefix: string): React.ReactNode {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter(s => s !== '');
  return segments.map((segment, idx) => {
    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      return <strong key={`${keyPrefix}-${idx}`}>{segment.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={`${keyPrefix}-${idx}`}>{segment}</React.Fragment>;
  });
}

function renderHeading(level: number, text: string, key: string): React.ReactNode {
  const style: React.CSSProperties = {
    fontSize: HEADING_SIZE[level],
    fontWeight: 800,
    fontFamily: 'var(--font-heading)',
    color: 'var(--text-primary)',
    margin: '0.9rem 0 0.4rem',
  };
  const content = renderInline(text, key);
  switch (level) {
    case 1: return <h1 key={key} style={style}>{content}</h1>;
    case 2: return <h2 key={key} style={style}>{content}</h2>;
    case 3: return <h3 key={key} style={style}>{content}</h3>;
    case 4: return <h4 key={key} style={style}>{content}</h4>;
    case 5: return <h5 key={key} style={style}>{content}</h5>;
    default: return <h6 key={key} style={style}>{content}</h6>;
  }
}

export function renderMarkdown(markdown: string): React.ReactNode[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 6);
      blocks.push(renderHeading(level, heading[2], `h-${key++}`));
      i++;
      continue;
    }

    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i])) {
        items.push(UL_RE.exec(lines[i])![1]);
        i++;
      }
      const k = `ul-${key++}`;
      blocks.push(
        <ul key={k} style={{ margin: '0.3rem 0', paddingLeft: '1.3rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6 }}>
          {items.map((item, idx) => <li key={`${k}-${idx}`}>{renderInline(item, `${k}-${idx}`)}</li>)}
        </ul>
      );
      continue;
    }

    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i])) {
        items.push(OL_RE.exec(lines[i])![1]);
        i++;
      }
      const k = `ol-${key++}`;
      blocks.push(
        <ol key={k} style={{ margin: '0.3rem 0', paddingLeft: '1.3rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6 }}>
          {items.map((item, idx) => <li key={`${k}-${idx}`}>{renderInline(item, `${k}-${idx}`)}</li>)}
        </ol>
      );
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !HEADING_RE.test(lines[i]) && !UL_RE.test(lines[i]) && !OL_RE.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    const k = `p-${key++}`;
    blocks.push(
      <p key={k} style={{ margin: '0.4rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.65 }}>
        {renderInline(paraLines.join(' '), k)}
      </p>
    );
  }

  return blocks;
}
