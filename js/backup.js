import * as db from './db.js';
import { todayISO } from './data.js';

// On phones, hand the file to the share sheet (Save to Files, AirDrop, ...); elsewhere download it.
export async function exportBackup() {
  const data = await db.exportAll();
  const name = `workout-log-${todayISO()}.json`;
  const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });

  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Workout Log backup' });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export async function readBackupFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not a Workout Log backup.');
  }
  if (!data || data.app !== 'workout-log' || !Array.isArray(data.profiles)) {
    throw new Error('That file is not a Workout Log backup.');
  }
  return data;
}
