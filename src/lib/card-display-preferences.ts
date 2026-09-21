import { useSyncExternalStore } from 'react';

const eventName = 'revystudy:card-display-preference';
const key = (id: string) => `revystudy:blur-portuguese:${id}`;
const subscribe = (notify: () => void) => {
  window.addEventListener(eventName, notify);
  window.addEventListener('storage', notify);
  return () => { window.removeEventListener(eventName, notify); window.removeEventListener('storage', notify); };
};
export function useBlurPortuguese(id: string) {
  return useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key(id)) === 'true'; } catch { return false; }
  }, () => false);
}
export function setBlurPortuguese(id: string, hidden: boolean) {
  localStorage.setItem(key(id), String(hidden));
  window.dispatchEvent(new Event(eventName));
}
