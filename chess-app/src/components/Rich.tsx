// Coach text with the important parts brought forward: moves become chips
// (with little piece pictures when figurines are on), numbers stand out from
// the sentence, and *words* in asterisks are set in italics.
import { Fragment, useEffect, useRef, useState } from 'react';
import { themeOf } from '../lib/appearance';
import { useSettings } from '../state/settings';

const TOKEN =
  /(\*[^*\n]+\*)|((?:O-O-O|O-O)[+#]?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][18]=[QRBN][+#]?|[a-h][1-8][+#])|(\d+(?:\.\d+)?%?)/g;

type Part = { kind: 'text' | 'em' | 'san' | 'num'; text: string };

const isWordChar = (c: string | undefined) => !!c && /[A-Za-z0-9]/.test(c);

/** Splits prose into plain text, moves, numbers and emphasised words. */
export function tokenize(text: string): Part[] {
  const out: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    const end = at + m[0].length;
    // Only whole words: "e5" inside "Be5x" or the 5 of "e5" are not tokens of their own.
    if (!m[1] && (isWordChar(text[at - 1]) || isWordChar(text[end]))) continue;
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
    out.push(m[1] ? { kind: 'em', text: m[1].slice(1, -1) } : { kind: m[2] ? 'san' : 'num', text: m[0] });
    last = end;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

const PIECE_NAME: Record<string, string> = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' };

/** One move in notation, with a piece picture instead of the letter when figurines are on. */
export function San({ san, chip = false }: { san: string; chip?: boolean }) {
  const figurines = useSettings((s) => s.figurines);
  const light = useSettings((s) => !!themeOf(s.theme).light);
  const cls = chip ? 'san chip' : 'san';
  if (!figurines) return <span className={cls}>{san}</span>;
  const lead = /^[KQRBN]/.test(san) ? san[0] : null;
  const promo = /=([QRBN])/.exec(san)?.[1];
  const body = san.slice(lead ? 1 : 0).replace(/=[QRBN]/, '=');
  const fig = (p: string) => <i className={`fig fig-${light ? 'b' : 'w'}${p}`} aria-hidden />;
  const spoken = `${lead ? `${PIECE_NAME[lead]} ` : ''}${san.slice(lead ? 1 : 0)}`;
  return (
    <span className={cls} role="img" aria-label={spoken}>
      {lead && fig(lead)}
      {promo ? (
        <>
          {body.split('=')[0]}={fig(promo)}
          {body.split('=')[1]}
        </>
      ) : (
        body
      )}
    </span>
  );
}

/** A sentence of coach text. */
export function Rich({ text, chips = true }: { text: string; chips?: boolean }) {
  return (
    <>
      {tokenize(text).map((p, i) =>
        p.kind === 'san' ? (
          <San key={i} san={p.text} chip={chips} />
        ) : p.kind === 'num' ? (
          <b key={i} className="rx-num">
            {p.text}
          </b>
        ) : p.kind === 'em' ? (
          <em key={i}>{p.text}</em>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

/** A line of moves such as "4... Nc6 5. exd6 Bxd6", with dim move numbers. */
export function Moves({ line }: { line: string }) {
  return (
    <span className="moves">
      {line.split(' ').map((tok, i) =>
        /^\d+\.(\.\.)?$/.test(tok) ? (
          <span key={i} className="mv-no">
            {tok}{' '}
          </span>
        ) : (
          <Fragment key={i}>
            <San san={tok} />{' '}
          </Fragment>
        ),
      )}
    </span>
  );
}

/** A heading with *accent* words in italics and nothing else changed. */
export function Accent({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*[^*]+\*)/)
        .map((part, i) =>
          part.startsWith('*') && part.endsWith('*') && part.length > 2 ? <em key={i}>{part.slice(1, -1)}</em> : <Fragment key={i}>{part}</Fragment>,
        )}
    </>
  );
}

const lastShown = new Map<string, number>();

/**
 * A number that counts to its new value. With an `id`, it counts from the
 * value last shown under that id (from 0 the first time), so a rating visibly
 * moves after a puzzle.
 */
export function CountUp({ value, id, decimals = 0, duration = 700 }: { value: number; id?: string; decimals?: number; duration?: number }) {
  const reduce = useSettings((s) => s.reduceMotion);
  const start = id ? (lastShown.get(id) ?? 0) : 0;
  const [shown, setShown] = useState(reduce ? value : start);
  const current = useRef(shown);
  useEffect(() => {
    if (id) lastShown.set(id, value);
    const still = reduce || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (still) {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      current.current = from + (value - from) * eased;
      setShown(current.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, id, reduce, duration]);
  return <>{shown.toFixed(decimals)}</>;
}
