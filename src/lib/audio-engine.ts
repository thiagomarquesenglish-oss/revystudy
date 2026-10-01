import { cloudMediaUrl } from './cloud-media';
import { readSavedAudio } from './saved-audio';

type ContextCtor = typeof AudioContext;
const contextClass = (): ContextCtor | undefined => typeof window === 'undefined' ? undefined : window.AudioContext || (window as unknown as { webkitAudioContext?: ContextCtor }).webkitAudioContext;
let context: AudioContext | undefined;
let activeSources = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const cancelIdle = () => { clearTimeout(idleTimer); };
const pauseWhenIdle = () => {
  cancelIdle();
  idleTimer = setTimeout(() => {
    if (!activeSources && context?.state === 'running') void context.suspend().catch(() => {});
  }, 15000);
};
const getContext = () => { const Ctor = contextClass(); if (!Ctor) return null; if (!context || context.state === 'closed') context = new Ctor(); return context; };
export const supportsWebAudio = () => !!contextClass();
export const unlockAudio = () => { cancelIdle(); const ctx = getContext(); if (!ctx) return null; try { const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession; if (session && session.type !== 'playback') session.type = 'playback'; } catch { /* unsupported */ } void ctx.resume().catch(() => {}); pauseWhenIdle(); return ctx; };

const decoded = new Map<string, Promise<AudioBuffer>>();
const sizes = new Map<string, number>();
export const audioResourceSnapshot = () => ({cached:decoded.size,bytes:[...sizes.values()].reduce((total,size) => total+size,0),playing:activeSources,state:context?.state || 'não iniciado'});
const trimCache = () => {
  let bytes = [...sizes.values()].reduce((total, size) => total + size, 0);
  for (const key of decoded.keys()) {
    if (decoded.size <= 8 && bytes <= 24 * 1024 * 1024) break;
    bytes -= sizes.get(key) || 0; sizes.delete(key); decoded.delete(key);
  }
};
export async function decodeAudioSource(src: string, online: boolean): Promise<AudioBuffer> {
  const key = `${src}|${online ? 'cloud' : 'saved'}`;
  const existing = decoded.get(key);
  if (existing) { decoded.delete(key); decoded.set(key, existing); return existing; }
  const work = (async () => {
    const ctx = getContext();
    if (!ctx) throw new Error('Web Audio não está disponível neste navegador.');
    const bytes = online ? await (async () => {
      const response = await fetch(cloudMediaUrl(src), { mode: 'cors', credentials: 'omit', cache: 'no-store' });
      if (!response.ok || response.type === 'opaque') throw new Error(`Não foi possível carregar o áudio (HTTP ${response.status}).`);
      return response.arrayBuffer();
    })() : await (async () => {
      const blob = await readSavedAudio(src);
      if (!blob) throw new Error('O áudio não está salvo neste aparelho.');
      return blob.arrayBuffer();
    })();
    if (!bytes.byteLength) throw new Error('O arquivo de áudio está vazio.');
    // Safari may detach the buffer during decoding; pass an independent copy.
    return await ctx.decodeAudioData(bytes.slice(0));
  })();
  decoded.set(key, work);
  trimCache();
  work.then(buffer => {
    if (decoded.get(key) === work) { sizes.set(key, buffer.length * buffer.numberOfChannels * 4); trimCache(); }
    if (!activeSources) pauseWhenIdle();
  }).catch(() => {
    if (decoded.get(key) === work) { decoded.delete(key); sizes.delete(key); }
    if (!activeSources) pauseWhenIdle();
  });
  return work;
}
export function forgetAudioSource(src: string) { for (const key of decoded.keys()) if (key.startsWith(`${src}|`)) { decoded.delete(key); sizes.delete(key); } }
export function playDecodedAudio(buffer: AudioBuffer, handlers: { onStarted: () => void; onEnded: () => void; onError: (error: unknown) => void }) {
  const ctx = getContext();
  if (!ctx) { handlers.onError(new Error('Web Audio não está disponível neste navegador.')); return () => {}; }
  let stopped = false;
  let node: AudioBufferSourceNode | undefined;
  let counted = false;
  const release = () => {
    if (node) { node.onended = null; try { node.disconnect(); node.buffer = null; } catch { /* ignore */ } }
    if (counted) { counted = false; activeSources--; }
    if (!activeSources) pauseWhenIdle();
  };
  const stop = () => { if (stopped) return; stopped = true; if (node) { try { node.stop(); } catch { /* already stopped */ } } release(); };
  const begin = () => {
    if (stopped) return;
    try {
      node = ctx.createBufferSource(); node.buffer = buffer; node.connect(ctx.destination);
      cancelIdle(); activeSources++; counted = true;
      node.onended = () => { if (!stopped) { stopped = true; release(); handlers.onEnded(); } };
      node.start(0); handlers.onStarted();
    } catch (error) { if (!stopped) { stopped = true; release(); handlers.onError(error); } }
  };
  if (ctx.state === 'running') begin(); else void ctx.resume().then(begin, handlers.onError);
  return stop;
}
