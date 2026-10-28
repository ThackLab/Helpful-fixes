// Backups: everything lives on this device, so the app reminds you now and
// then to save a copy somewhere safe (Files, iCloud Drive, Google Drive...).
import { useEffect, useState } from 'react';
import { exportAll, listGames, onDbChange } from './storage/db';
import { shareOrSaveFile } from './platform';
import { useSettings } from '../state/settings';

const DAY = 86_400_000;
/** Ask again this long after a backup or a "later". */
const REMIND_AFTER = 14 * DAY;
/** Not worth asking before there is something to lose. */
const MIN_GAMES = 3;

export async function backupNow(): Promise<string | null> {
  const data = await exportAll(
    JSON.parse(localStorage.getItem('outpost.profile') ?? 'null'),
    JSON.parse(localStorage.getItem('outpost.learn') ?? 'null'),
  );
  const where = await shareOrSaveFile(`outpost-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify(data));
  if (where) useSettings.getState().set({ lastBackupAt: Date.now() });
  return where;
}

export const snoozeBackup = () => useSettings.getState().set({ backupSnoozedAt: Date.now() });

/** Whether to show the backup reminder. */
export function useBackupDue(): boolean {
  const last = useSettings((s) => Math.max(s.lastBackupAt, s.backupSnoozedAt));
  const [games, setGames] = useState(0);
  useEffect(() => {
    const load = () => void listGames().then((g) => setGames(g.length));
    load();
    return onDbChange(load);
  }, []);
  return games >= MIN_GAMES && Date.now() - last > REMIND_AFTER;
}
