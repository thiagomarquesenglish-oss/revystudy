import { resolveOfflineMediaUrl } from './offline-media';

let context: AudioContext | undefined;
const buffers = new Map<string, Promise<AudioBuffer>>();
export function supportsDecodedAudio() { return typeof window.AudioContext === 'function'; }
function getContext() {
  if (!context || context.state === 'closed') context = new AudioContext();
  return context;
}
export function audioIsRunning() { return context?.state === 'running'; }
export function prepareDecodedAudio(src: string): Promise<AudioBuffer> {
  const cached = buffers.get(src);
  if (cached) return cached;
  const work = (async () => {
    const local = await resolveOfflineMediaUrl(src);
    // For downloaded HTTPS media this is a blob URL: no cloud or service worker.
    const response = await fetch(local);
    if (!response.ok) throw new Error('Não foi possível ler os bytes do áudio local.');
    const bytes = await response.arrayBuffer();
    try { return await getContext().decodeAudioData(bytes); }
    catch { throw new Error('O arquivo local não pôde ser decodificado. Verifique se o áudio original abre e se está em MP3 ou M4A.'); }
  })();
  let timer: ReturnType<typeof setTimeout>;
  const pending = Promise.race([work, new Promise<AudioBuffer>((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('A leitura ou decodificação do áudio local demorou demais. Tente novamente.')),12000);
  })]).finally(()=>clearTimeout(timer));
  buffers.set(src, pending);
  pending.catch(() => { if (buffers.get(src) === pending) buffers.delete(src); });
  // Only keep a small lookahead of decoded phrases, not an entire deck in RAM.
  if (buffers.size > 8) buffers.delete(buffers.keys().next().value!);
  return pending;
}

export function playDecodedAudio(buffer: AudioBuffer, onStarted: () => void, onEnded: () => void, onError: (message: string) => void) {
  const ctx = getContext();
  let stopped = false;
  let node: AudioBufferSourceNode | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true; clearTimeout(timer);
    if (node) { node.onended = null; try { node.stop(); } catch {} node.disconnect(); }
  };
  const fail = () => { stop(); onError('O iPhone não liberou a saída de áudio. Toque novamente em play.'); };
  const start = () => {
    if (stopped) return;
    if (ctx.state !== 'running') { fail(); return; }
    clearTimeout(timer);
    node = ctx.createBufferSource(); node.buffer = buffer; node.connect(ctx.destination);
    node.onended = () => { if (!stopped) { stop(); onEnded(); } };
    node.start(); onStarted();
  };
  try {
    if (ctx.state === 'running') start();
    else {
      // resume is called directly in the tap, before any async work.
      timer = setTimeout(fail, 3000);
      void ctx.resume().then(start).catch(() => { if (!stopped) fail(); });
    }
  } catch { fail(); }
  return stop;
}
