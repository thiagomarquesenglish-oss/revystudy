import { useEffect, useSyncExternalStore } from 'react';
import { localDB } from './offline-db';

const eventName = 'revystudy:card-display-preference';
const key = (id: string) => `revystudy:blur-portuguese:${id}`;
const revisions = new Map<string, number>();
const memory = new Map<string, boolean>();
const read = (id: string) => {
  try { const value = localStorage.getItem(key(id)); if (value !== null) return value === 'true'; } catch { /* Use in-memory copy if storage is unavailable. */ }
  return memory.get(id) ?? false;
};
function publish(id: string, hidden: boolean) {
  memory.set(id, hidden);
  try { localStorage.setItem(key(id), String(hidden)); } catch { /* Durable copy is already in IndexedDB. */ }
  window.dispatchEvent(new Event(eventName));
}
export async function restoreBlurPortuguese(id: string) {
  const revision = revisions.get(id) || 0;
  const saved = await localDB.getCardDisplayPreference(id);
  if ((revisions.get(id) || 0) !== revision) return;
  if (saved) publish(id, saved.hidden);
  else {
    const hidden = read(id);
    if (hidden) await localDB.saveCardDisplayPreference(id, hidden);
  }
}
const subscribe = (notify: () => void) => {
  window.addEventListener(eventName, notify);
  window.addEventListener('storage', notify);
  return () => { window.removeEventListener(eventName, notify); window.removeEventListener('storage', notify); };
};
export function useBlurPortuguese(id: string) {
  useEffect(() => { void restoreBlurPortuguese(id).catch(console.error); }, [id]);
  return useSyncExternalStore(subscribe, () => read(id), () => false);
}
export async function setBlurPortuguese(id: string, hidden: boolean) {
  revisions.set(id, (revisions.get(id) || 0) + 1);
  await localDB.saveCardDisplayPreference(id, hidden);
  publish(id, hidden);
}
