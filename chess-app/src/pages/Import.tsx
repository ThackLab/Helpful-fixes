import { useState } from 'react';
import { mainlineMoves, parsePgn, type ParsedGame } from '../lib/chess/pgn';
import { getOpeningBook } from '../lib/chess/openings';
import { navigate } from '../lib/router';
import { listGames, saveGame, type GameRecord } from '../lib/storage/db';
import { Segmented, toast } from '../components/Widgets';
import { useReviewer } from '../state/reviewer';
import { Chess } from 'chess.js';
import { PageHead } from '../components/ui';

type Source = 'chesscom' | 'lichess' | 'pgn';

interface Candidate {
  key: string;
  pgn: string;
  white: string;
  black: string;
  whiteElo?: number;
  blackElo?: number;
  result: string;
  date?: string;
  timeClass?: string;
  url?: string;
  site: string;
}

const LS_USER = 'outpost.import-user';

function savedUser(src: Source) {
  try {
    return JSON.parse(localStorage.getItem(LS_USER) ?? '{}')[src] ?? '';
  } catch {
    return '';
  }
}

function rememberUser(src: Source, name: string) {
  try {
    const cur = JSON.parse(localStorage.getItem(LS_USER) ?? '{}');
    cur[src] = name;
    localStorage.setItem(LS_USER, JSON.stringify(cur));
  } catch {
    /* ignore */
  }
}

async function fetchChessCom(user: string): Promise<Candidate[]> {
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`;
  const res = await fetch(base);
  if (res.status === 404) throw new Error('chess.com user not found');
  if (!res.ok) throw new Error(`chess.com responded ${res.status}`);
  const { archives } = (await res.json()) as { archives: string[] };
  const out: Candidate[] = [];
  for (const url of [...archives].reverse().slice(0, 3)) {
    const r = await fetch(url);
    if (!r.ok) continue;
    const data = (await r.json()) as {
      games: {
        pgn?: string;
        url: string;
        time_class: string;
        rules: string;
        end_time: number;
        white: { username: string; rating: number; result: string };
        black: { username: string; rating: number; result: string };
      }[];
    };
    for (const g of [...data.games].reverse()) {
      if (!g.pgn || g.rules !== 'chess') continue;
      const res = g.white.result === 'win' ? '1-0' : g.black.result === 'win' ? '0-1' : '1/2-1/2';
      out.push({
        key: g.url,
        pgn: g.pgn,
        white: g.white.username,
        black: g.black.username,
        whiteElo: g.white.rating,
        blackElo: g.black.rating,
        result: res,
        date: new Date(g.end_time * 1000).toLocaleDateString(),
        timeClass: g.time_class,
        url: g.url,
        site: 'chess.com',
      });
    }
    if (out.length >= 40) break;
  }
  return out.slice(0, 50);
}

async function fetchLichess(user: string): Promise<Candidate[]> {
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=40&pgnInJson=true&opening=true`, {
    headers: { Accept: 'application/x-ndjson' },
  });
  if (res.status === 404) throw new Error('lichess user not found');
  if (!res.ok) throw new Error(`lichess responded ${res.status}`);
  const text = await res.text();
  const out: Candidate[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const g = JSON.parse(line) as {
      id: string;
      variant: string;
      speed: string;
      createdAt: number;
      winner?: 'white' | 'black';
      pgn: string;
      players: {
        white: { user?: { name: string }; rating?: number; aiLevel?: number };
        black: { user?: { name: string }; rating?: number; aiLevel?: number };
      };
    };
    if (g.variant !== 'standard') continue;
    const nm = (p: typeof g.players.white) => p.user?.name ?? (p.aiLevel ? `Stockfish level ${p.aiLevel}` : 'Anonymous');
    out.push({
      key: g.id,
      pgn: g.pgn,
      white: nm(g.players.white),
      black: nm(g.players.black),
      whiteElo: g.players.white.rating,
      blackElo: g.players.black.rating,
      result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2',
      date: new Date(g.createdAt).toLocaleDateString(),
      timeClass: g.speed,
      url: `https://lichess.org/${g.id}`,
      site: 'lichess',
    });
  }
  return out;
}

function candidatesFromPgn(text: string): Candidate[] {
  return parsePgn(text)
    .filter((g) => g.tree.nodes[g.tree.rootId].children.length)
    .map((g: ParsedGame, i) => ({
      key: `pgn-${i}-${g.headers.White}-${g.headers.Black}-${g.headers.Date}`,
      pgn: pgnOf(text, i),
      white: g.headers.White ?? 'White',
      black: g.headers.Black ?? 'Black',
      whiteElo: +g.headers.WhiteElo || undefined,
      blackElo: +g.headers.BlackElo || undefined,
      result: g.result,
      date: g.headers.Date,
      site: g.headers.Site ?? 'PGN',
    }));
}

/** Splits a multi-game PGN into the text of game `i` (falls back to the whole text). */
function pgnOf(text: string, i: number): string {
  const chunks = text.split(/\n(?=\[Event )/);
  return chunks.length > i ? chunks[i] : text;
}

export function toRecord(c: Candidate, user?: string): GameRecord | null {
  const parsed = parsePgn(c.pgn)[0];
  if (!parsed) return null;
  const { startFen, moves, sans } = mainlineMoves(parsed.tree);
  if (!moves.length) return null;
  const u = user?.toLowerCase();
  const userColor = u ? (c.white.toLowerCase() === u ? 'w' : c.black.toLowerCase() === u ? 'b' : undefined) : undefined;
  const fens = [startFen];
  const chess = new Chess(startFen);
  for (const m of moves) {
    chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    fens.push(chess.fen());
  }
  return {
    id: `imp-${c.site}-${c.key}`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80),
    createdAt: Date.now(),
    source: c.site === 'PGN' || c.site.startsWith('pgn') ? 'pgn' : 'import',
    white: { name: c.white, elo: c.whiteElo, isUser: userColor === 'w' },
    black: { name: c.black, elo: c.blackElo, isUser: userColor === 'b' },
    result: (['1-0', '0-1', '1/2-1/2'].includes(c.result) ? c.result : '*') as GameRecord['result'],
    termination: parsed.headers.Termination,
    startFen,
    moves,
    sans,
    pgn: c.pgn,
    timeControl: c.timeClass ?? parsed.headers.TimeControl,
    opening: parsed.headers.Opening ?? getOpeningBook()?.classify(fens)?.name,
    userColor,
    url: c.url,
    date: c.date,
  };
}

export function ImportPage() {
  const [src, setSrc] = useState<Source>('chesscom');
  const [user, setUser] = useState<string>(() => savedUser('chesscom'));
  const [pgn, setPgn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<Candidate[]>([]);
  const [known, setKnown] = useState<Set<string>>(new Set());

  const refreshKnown = async () => setKnown(new Set((await listGames()).map((g) => g.id)));

  const load = async () => {
    setError(null);
    setBusy(true);
    setList([]);
    try {
      let out: Candidate[] = [];
      if (src === 'pgn') out = candidatesFromPgn(pgn);
      else {
        if (!user.trim()) throw new Error('Enter a username');
        rememberUser(src, user.trim());
        out = src === 'chesscom' ? await fetchChessCom(user.trim()) : await fetchLichess(user.trim());
      }
      if (!out.length) throw new Error('No games found');
      setList(out);
      await refreshKnown();
    } catch (e) {
      setError(e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error - are you online?' : e.message) : String(e));
    } finally {
      setBusy(false);
    }
  };

  const importOne = async (c: Candidate, review: boolean) => {
    const rec = toRecord(c, src === 'pgn' ? undefined : user.trim());
    if (!rec) return toast('Could not read that game');
    if (!known.has(rec.id)) await saveGame(rec);
    await refreshKnown();
    if (review) navigate(`/review/${rec.id}`);
  };

  const importAll = async () => {
    let n = 0;
    for (const c of list) {
      const rec = toRecord(c, src === 'pgn' ? undefined : user.trim());
      if (rec && !known.has(rec.id)) {
        await saveGame(rec);
        n++;
      }
    }
    await refreshKnown();
    toast(`Imported ${n} game(s)`);
  };

  const idOf = (c: Candidate) => `imp-${c.site}-${c.key}`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
  const me = user.trim().toLowerCase();

  return (
    <div className="page narrow">
      <PageHead title="Import games" back="/you" />
      <p className="muted">Review your games from chess.com or lichess for free, or paste/upload any PGN (multi-game files are fine).</p>
      <div className="card" style={{ marginBottom: 16 }}>
        <Segmented
          value={src}
          onChange={(s) => {
            setSrc(s);
            setList([]);
            setError(null);
            if (s !== 'pgn') setUser(savedUser(s));
          }}
          options={[
            { value: 'chesscom', label: 'chess.com' },
            { value: 'lichess', label: 'lichess' },
            { value: 'pgn', label: 'PGN' },
          ]}
        />
        <div style={{ marginTop: 12 }}>
          {src === 'pgn' ? (
            <>
              <textarea rows={8} placeholder="Paste PGN here" value={pgn} onChange={(e) => setPgn(e.target.value)} />
              <div className="row" style={{ marginTop: 8 }}>
                <label className="btn small">
                  Open .pgn file
                  <input
                    type="file"
                    accept=".pgn,.txt"
                    style={{ display: 'none' }}
                    onChange={async (e) => e.target.files?.[0] && setPgn(await e.target.files[0].text())}
                  />
                </label>
                <span className="spacer" />
                <button className="btn primary" onClick={load} disabled={busy || !pgn.trim()}>
                  Read games
                </button>
              </div>
            </>
          ) : (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                void load();
              }}
            >
              <input
                placeholder={`${src === 'chesscom' ? 'chess.com' : 'lichess'} username`}
                value={user}
                onChange={(e) => setUser(e.target.value)}
                style={{ flex: 1, minWidth: 200 }}
              />
              <button className="btn primary" disabled={busy}>
                {busy ? 'Loading…' : 'Fetch recent games'}
              </button>
            </form>
          )}
        </div>
        {error && (
          <div className="error-box" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
      </div>

      {list.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <div className="row" style={{ padding: '12px 14px' }}>
            <b>{list.length} games</b>
            <span className="spacer" />
            <button className="btn small" onClick={importAll}>
              Import all to library
            </button>
            <button
              className="btn small primary"
              onClick={async () => {
                await importAll();
                for (const c of list.slice(0, 10)) void useReviewer.getState().start(idOf(c));
                toast('Reviewing the 10 most recent games in the background');
              }}
            >
              Import & review latest 10
            </button>
          </div>
          <table className="table">
            <tbody>
              {list.map((c) => {
                const userWhite = c.white.toLowerCase() === me;
                const userBlack = c.black.toLowerCase() === me;
                const outcome =
                  c.result === '1/2-1/2' ? 'draw' : userWhite || userBlack ? ((c.result === '1-0') === userWhite ? 'win' : 'loss') : null;
                return (
                  <tr key={c.key}>
                    <td>
                      {outcome ? (
                        <span className={`result-chip ${outcome}`}>{outcome === 'win' ? '+' : outcome === 'loss' ? '−' : '='}</span>
                      ) : (
                        <span className="tag">{c.result}</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: userWhite ? 800 : 500 }}>
                        ♔ {c.white} <span className="faint">{c.whiteElo ?? ''}</span>
                      </div>
                      <div style={{ fontWeight: userBlack ? 800 : 500 }}>
                        ♚ {c.black} <span className="faint">{c.blackElo ?? ''}</span>
                      </div>
                    </td>
                    <td className="faint" style={{ fontSize: '0.85rem' }}>
                      {c.timeClass}
                      <div>{c.date}</div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {known.has(idOf(c)) && (
                        <span className="tag" style={{ marginRight: 6 }}>
                          saved
                        </span>
                      )}
                      <button className="btn small primary" onClick={() => importOne(c, true)}>
                        ⭐ Review
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
