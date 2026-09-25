import { cloudMediaUrl } from './cloud-media';
import { readSavedAudio } from './saved-audio';

type ContextCtor = typeof AudioContext;
const contextClass = (): ContextCtor | undefined => typeof window === 'undefined' ? undefined : window.AudioContext || (window as unknown as { webkitAudioContext?: ContextCtor }).webkitAudioContext;
let context: AudioContext | undefined;
const getContext = () => { const Ctor = contextClass(); if (!Ctor) return null; if (!context || context.state === 'closed') context = new Ctor(); return context; };
export const supportsWebAudio = () => !!contextClass();
export const unlockAudio = () => { const ctx = getContext(); if (!ctx) return null; try { const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession; if (session && session.type !== 'playback') session.type = 'playback'; } catch { /* unsupported */ } void ctx.resume(); return ctx; };

const decoded = new Map<string, Promise<AudioBuffer>>();
export async function decodeAudioSource(src: string, online: boolean): Promise<AudioBuffer> {
  const key = `${src}|${online ? 'cloud' : 'saved'}`;
  const existing = decoded.get(key);
  if (existing) return existing;
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
  work.catch(() => decoded.delete(key));
  return work;
}
export function forgetAudioSource(src: string) { for (const key of decoded.keys()) if (key.startsWith(`${src}|`)) decoded.delete(key); }
export function playDecodedAudio(buffer: AudioBuffer, handlers: { onStarted: () => void; onEnded: () => void; onError: (error: unknown) => void }) {
  const ctx = getContext();
  if (!ctx) { handlers.onError(new Error('Web Audio não está disponível neste navegador.')); return () => {}; }
  let stopped = false;
  let node: AudioBufferSourceNode | undefined;
  const stop = () => { stopped = true; if (node) { node.onended = null; try { node.stop(); } catch { /* already stopped */ } try { node.disconnect(); } catch { /* ignore */ } } };
  const begin = () => {
    if (stopped) return;
    try {
      node = ctx.createBufferSource(); node.buffer = buffer; node.connect(ctx.destination);
      node.onended = () => { if (!stopped) { stopped = true; handlers.onEnded(); } };
      node.start(0); handlers.onStarted();
    } catch (error) { if (!stopped) { stopped = true; handlers.onError(error); } }
  };
  if (ctx.state === 'running') begin(); else void ctx.resume().then(begin, handlers.onError);
  return stop;
}
