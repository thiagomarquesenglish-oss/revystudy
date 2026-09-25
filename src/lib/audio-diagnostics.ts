type Entry = { time: string; event: string; player: string; data: Record<string, unknown> };
const entries: Entry[] = [];
let nextId = 0;
export function audioDiagnosticId() { return `player-${++nextId}`; }
export function recordAudio(event: string, player: string, data: Record<string, unknown> = {}) {
  entries.push({ time: new Date().toISOString(), event, player, data });
  if (entries.length > 250) entries.shift();
}
export function audioSnapshot(audio: HTMLAudioElement | null) {
  return audio ? {
    readyState: audio.readyState, networkState: audio.networkState,
    paused: audio.paused, currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : null,
    errorCode: audio.error?.code ?? null,
    source: audio.currentSrc.startsWith('blob:') ? 'blob' : audio.currentSrc ? 'other' : 'none',
    visible: document.visibilityState, activated: navigator.userActivation?.isActive,
  } : {};
}
export function audioDiagnosticReport() {
  return JSON.stringify({ version: __APP_VERSION__, userAgent: navigator.userAgent,
    online: navigator.onLine, standalone: window.matchMedia?.('(display-mode: standalone)').matches,
    events: entries }, null, 2);
}
