// Which openings are in your repertoire, and how well you know each line
// (spaced repetition: a line comes back sooner after a mistake).
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useLearn } from './learn';

const DAY = 86_400_000;
/** When a line is due again after a clean run, by box. */
const INTERVALS = [0, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY, 80 * DAY];
/** Box at which a line counts as learnt. */
export const LEARNT_BOX = 3;

export interface LineProgress {
  box: number;
  due: number;
  runs: number;
  misses: number;
}

interface RepertoireState {
  selected: string[];
  lines: Record<string, LineProgress>;
  toggle: (packId: string) => void;
  /** Records a run through a line; `clean` means no wrong moves. */
  grade: (lineId: string, clean: boolean) => LineProgress;
}

export const useRepertoire = create<RepertoireState>()(
  persist(
    (set, get) => ({
      selected: [],
      lines: {},
      toggle: (id) => set((s) => ({ selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] })),
      grade: (lineId, clean) => {
        const cur = get().lines[lineId] ?? { box: 0, due: 0, runs: 0, misses: 0 };
        const box = clean ? Math.min(INTERVALS.length - 1, cur.box + 1) : Math.max(0, cur.box - 2);
        const next: LineProgress = {
          box,
          due: Date.now() + (clean ? INTERVALS[box] : 10 * 60_000),
          runs: cur.runs + 1,
          misses: cur.misses + (clean ? 0 : 1),
        };
        set((s) => ({ lines: { ...s.lines, [lineId]: next } }));
        useLearn.getState().noteOpening();
        return next;
      },
    }),
    { name: 'outpost.repertoire', version: 1 },
  ),
);

/** When a line comes back, in words: "tomorrow", "in 3 days". */
export function nextReviewText(p: LineProgress): string {
  const days = Math.round((p.due - Date.now()) / DAY);
  if (days <= 0) return 'in a few minutes';
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}
