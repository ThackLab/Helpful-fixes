// What to train next, based on the mistakes in your recent reviewed games.
import { useEffect, useState } from 'react';
import { getReview, listGames, onDbChange } from '../storage/db';
import { THEMES, moveTheme, type Theme } from '../review/lessons';
import { LESSON_FOR_THEME, findLesson, type Lesson } from './curriculum';

export interface TrainingFocus {
  theme: Theme;
  /** How many of your recent mistakes had this theme. */
  count: number;
  games: number;
  title: string;
  lesson: Lesson;
}

async function computeFocus(): Promise<TrainingFocus | null> {
  const games = (await listGames()).filter((g) => g.userColor && g.reviewedAt).slice(0, 10);
  const counts = new Map<Theme, number>();
  for (const g of games) {
    const review = await getReview(g.id);
    if (!review) continue;
    review.moves.forEach((m, i) => {
      if (m.color !== g.userColor) return;
      const t = moveTheme(review, i);
      if (t && LESSON_FOR_THEME[t]) counts.set(t, (counts.get(t) ?? 0) + 1);
    });
  }
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!top) return null;
  const lesson = findLesson(LESSON_FOR_THEME[top[0]]);
  return lesson ? { theme: top[0], count: top[1], games: games.length, title: THEMES[top[0]].title, lesson } : null;
}

export function useTrainingFocus(): TrainingFocus | null {
  const [focus, setFocus] = useState<TrainingFocus | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void computeFocus().then((f) => alive && setFocus(f));
    load();
    const off = onDbChange(load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return focus;
}
