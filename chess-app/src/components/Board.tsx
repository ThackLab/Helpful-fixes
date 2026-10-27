import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import '../styles/pieces.generated.css';
import { useSettings } from '../state/settings';

export type CgColor = 'white' | 'black';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface BoardProps {
  fen: string;
  orientation: CgColor;
  /** Side allowed to move pieces; undefined = nobody. */
  movableColor?: CgColor | 'both';
  /** Legal destinations (from -> tos). */
  dests?: Map<string, string[]>;
  turnColor?: CgColor;
  lastMove?: [string, string];
  check?: boolean;
  shapes?: DrawShape[];
  highlights?: Map<string, string>;
  premovable?: boolean;
  viewOnly?: boolean;
  /** Called after a user move; promotion is resolved first. */
  onMove?: (from: string, to: string, promotion?: PromotionPiece) => void;
  /** Called when a square is tapped (for "spot the pattern" exercises). */
  onSelect?: (square: string) => void;
  /** Free editing (board editor). */
  free?: boolean;
  onChange?: (fen: string) => void;
  className?: string;
}

export interface BoardHandle {
  playPremove(): boolean;
  cancelPremove(): void;
  api(): Api | null;
}

const PROMO: PromotionPiece[] = ['q', 'n', 'r', 'b'];
const ROLE: Record<PromotionPiece, string> = { q: 'queen', n: 'knight', r: 'rook', b: 'bishop' };

function needsPromotion(fen: string, from: string, to: string): boolean {
  const board = fen.split(' ')[0].split('/');
  const rank = 8 - +from[1];
  const file = from.charCodeAt(0) - 97;
  let col = 0;
  for (const ch of board[rank] ?? '') {
    if (/\d/.test(ch)) col += +ch;
    else {
      if (col === file) return (ch === 'P' && to[1] === '8') || (ch === 'p' && to[1] === '1');
      col++;
    }
  }
  return false;
}

export const Board = memo(
  forwardRef<BoardHandle, BoardProps>(function Board(props, ref) {
    const el = useRef<HTMLDivElement>(null);
    const cg = useRef<Api | null>(null);
    const propsRef = useRef(props);
    propsRef.current = props;
    const settings = useSettings();
    const [promo, setPromo] = useState<{ from: string; to: string; color: CgColor } | null>(null);

    useImperativeHandle(ref, () => ({
      playPremove: () => cg.current?.playPremove() ?? false,
      cancelPremove: () => cg.current?.cancelPremove(),
      api: () => cg.current,
    }));

    const config = (): Config => {
      const p = propsRef.current;
      return {
        fen: p.fen.split(' ')[0],
        orientation: p.orientation,
        turnColor: p.turnColor ?? (p.fen.split(' ')[1] === 'b' ? 'black' : 'white'),
        lastMove: p.lastMove as Key[] | undefined,
        check: p.check,
        coordinates: settings.coordinates,
        viewOnly: p.viewOnly,
        animation: { enabled: settings.animation, duration: 180 },
        highlight: { lastMove: true, check: true, custom: p.highlights as Map<Key, string> | undefined },
        movable: {
          free: !!p.free,
          color: p.free ? 'both' : p.movableColor,
          dests: p.free ? undefined : (p.dests as Map<Key, Key[]> | undefined),
          showDests: settings.showLegalMoves,
          events: {
            after: (orig, dest) => {
              const cur = propsRef.current;
              if (cur.free) {
                cur.onChange?.(cg.current!.getFen());
                return;
              }
              if (needsPromotion(cur.fen, orig, dest)) {
                if (useSettings.getState().autoQueen) cur.onMove?.(orig, dest, 'q');
                else setPromo({ from: orig, to: dest, color: cur.fen.split(' ')[1] === 'b' ? 'black' : 'white' });
              } else cur.onMove?.(orig, dest);
            },
          },
        },
        premovable: { enabled: !!p.premovable && settings.premoves },
        draggable: { enabled: true, showGhost: true, deleteOnDropOff: !!p.free },
        selectable: { enabled: true },
        drawable: { enabled: true, visible: true, autoShapes: p.shapes ?? [] },
        events: {
          change: () => propsRef.current.free && propsRef.current.onChange?.(cg.current!.getFen()),
          select: (key) => propsRef.current.onSelect?.(key),
        },
      };
    };

    // chessground binds its input listeners only when it is created, so a
    // view-only board must be rebuilt to become playable (and vice versa).
    useEffect(() => {
      if (!el.current) return;
      cg.current = Chessground(el.current, config());
      return () => {
        cg.current?.destroy();
        cg.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [!!props.viewOnly]);

    // Only reconfigure when something relevant changed, so unrelated re-renders
    // (clock ticks, engine output) never interrupt a drag in progress.
    useEffect(() => {
      if (promo) return;
      cg.current?.set(config());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      promo,
      props.fen,
      props.orientation,
      props.movableColor,
      props.dests,
      props.turnColor,
      props.lastMove?.join(''),
      props.check,
      props.shapes,
      props.highlights,
      props.viewOnly,
      props.premovable,
      props.free,
      settings.coordinates,
      settings.animation,
      settings.showLegalMoves,
      settings.premoves,
    ]);

    const finishPromotion = (piece: PromotionPiece | null) => {
      const p = promo;
      setPromo(null);
      if (!p) return;
      if (piece) props.onMove?.(p.from, p.to, piece);
      else cg.current?.set(config());
    };

    const promoStyle = (() => {
      if (!promo) return undefined;
      const file = promo.to.charCodeAt(0) - 97;
      const col = props.orientation === 'white' ? file : 7 - file;
      const top = (props.orientation === 'white') === (promo.color === 'white');
      return {
        left: `${col * 12.5}%`,
        top: top ? 0 : undefined,
        bottom: top ? undefined : 0,
        flexDirection: top ? 'column' : 'column-reverse',
      } as const;
    })();

    return (
      <div className={`board-wrap theme-${settings.boardTheme} ${props.className ?? ''}`}>
        <div ref={el} className="cg-host" />
        {promo && (
          <div className="promo-overlay" onClick={() => finishPromotion(null)}>
            <div className="promo-col" style={promoStyle} onClick={(e) => e.stopPropagation()}>
              {PROMO.map((p) => (
                <button key={p} className="promo-choice" onClick={() => finishPromotion(p)} aria-label={`Promote to ${ROLE[p]}`}>
                  <piece className={`${promo.color} ${ROLE[p]}`} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }),
);

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      piece: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
