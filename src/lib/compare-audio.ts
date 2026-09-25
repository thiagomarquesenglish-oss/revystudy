import { readSavedAudio } from './saved-audio';
import { cloudMediaUrl } from './cloud-media';

export function sameAudioBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
function signature(bytes: Uint8Array) {
  if (bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) return 'ID3';
  if (bytes[0] === 255 && (bytes[1] & 224) === 224) return 'MPEG-or-AAC-sync';
  if (String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') return 'MP4';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF') return 'RIFF';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'OggS') return 'Ogg';
  return 'unknown';
}
// Diagnostic only: never writes to the saved cache or changes the player source.
export async function compareAudio(src: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const local = await readSavedAudio(src);
    if (!local) throw new Error('Não foi encontrado um áudio salvo para comparar.');
    const response = await fetch(cloudMediaUrl(src), { cache: 'no-store', credentials: 'omit', mode: 'cors', signal: controller.signal });
    if (response.status !== 200 || response.type === 'opaque') throw new Error(`Não foi possível consultar o original (HTTP ${response.status}).`);
    const remote = await response.blob();
    const a = new Uint8Array(await local.arrayBuffer());
    const b = new Uint8Array(await remote.arrayBuffer());
    return { identical: sameAudioBytes(a, b), localBytes: a.length, remoteBytes: b.length,
      localMime: local.type, remoteMime: remote.type, localSignature: signature(a), remoteSignature: signature(b) };
  } finally { clearTimeout(timeout); }
}
