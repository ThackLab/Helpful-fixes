// Small platform layer so the same build runs in browsers and inside the
// Android app, whose WebView can't download blobs and exposes a native bridge.

interface AndroidBridge {
  /** Writes a file to the device's Downloads folder; returns where it went ('' on failure). */
  saveFile(name: string, mime: string, content: string): string;
  copyText(text: string): void;
  /** Vibrates in a pattern of on/off milliseconds, comma-separated (app version 1.1 and later). */
  vibrate?(pattern: string): void;
}

const bridge = (globalThis as { OutpostAndroid?: AndroidBridge }).OutpostAndroid;

export const isAndroidApp = !!bridge;

/** Whether this device can vibrate: the Android app, or a browser with the Vibration API (not iOS). */
export const canVibrate = typeof bridge?.vibrate === 'function' || (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function');

export function vibrate(pattern: number[]) {
  try {
    if (typeof bridge?.vibrate === 'function') bridge.vibrate(pattern.join(','));
    else navigator.vibrate?.(pattern);
  } catch {
    // Some browsers refuse without a recent tap; that's fine.
  }
}

export const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/** Saves text as a file. Returns a short description of where it was saved, if known. */
export function saveTextFile(name: string, mime: string, text: string): string | null {
  if (bridge) {
    const where = bridge.saveFile(name, mime, text);
    if (!where) throw new Error('Could not save the file');
    return where;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return null;
}

/**
 * Hands a file to the phone's share sheet, which offers "Save to Files",
 * iCloud Drive, Google Drive and so on; falls back to a download. Resolves to
 * where it went, or null if the person cancelled.
 */
export async function shareOrSaveFile(name: string, mime: string, text: string): Promise<'shared' | 'downloaded' | string | null> {
  if (bridge) return saveTextFile(name, mime, text);
  const file = typeof File !== 'undefined' ? new File([text], name, { type: mime }) : null;
  if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Outpost Chess backup' });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
    }
  }
  saveTextFile(name, mime, text);
  return 'downloaded';
}

export async function copyText(text: string): Promise<void> {
  if (bridge) {
    bridge.copyText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}
