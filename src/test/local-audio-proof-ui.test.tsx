import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LocalAudioProof from '@/components/LocalAudioProof';
import { checkLocalAudioWorker, installAudioSample } from '@/lib/local-audio-proof';

const state = vi.hoisted(() => ({entries: [] as any[]}));
vi.mock('@/lib/storage', () => ({ getCards: vi.fn(async () => []) }));
vi.mock('@/components/AudioDiagnosticCopy', () => ({ default: () => <button>Copiar diagnóstico</button> }));
vi.mock('@/lib/local-audio-proof', () => ({
  loadAudioSamples: () => [...state.entries],
  checkLocalAudioWorker: vi.fn(async () => {}),
  selectAudioSamples: () => [{source:'https://cloud/1.mp3',label:'Try again.',cardId:'one'}],
  installAudioSample: vi.fn(async (_:string, sample:any) => {
    const entry = {...sample,localUrl:'/__local_audio/v1/u/'+'a'.repeat(64)+'.mp3',hash:'a'.repeat(64),bytes:40000};
    state.entries = [entry]; return entry;
  }),
  clearAudioSamples: vi.fn(async () => { state.entries = []; }),
}));
beforeEach(() => { state.entries = []; vi.clearAllMocks(); vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('only prepares on demand and renders the native local player after installation', async () => {
  render(<LocalAudioProof userId="u" />);
  expect(installAudioSample).not.toHaveBeenCalled();
  expect(document.querySelector('audio')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Preparar até 5 áudios para teste'}));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Amostra instalada'));
  const player = document.querySelector('audio')!;
  expect(player.getAttribute('src')).toMatch(/^\/__local_audio\//);
  expect(player.controls).toBe(true);
  expect(player.preload).toBe('none');
  expect(player.autoplay).toBe(false);
  Object.defineProperty(player,'currentTime',{configurable:true,value:0.5});
  fireEvent.timeUpdate(player);
  expect(screen.getByText(/Reprodução avançou neste teste/)).toBeInTheDocument();
});

it('keeps installed players on reopening without preparing again and only removes the sample', async () => {
  await installAudioSample('u',{source:'https://cloud/1.mp3',label:'Try again.',cardId:'one'});
  vi.mocked(installAudioSample).mockClear();
  const view = render(<LocalAudioProof userId="u" />);
  expect(document.querySelector('audio')).not.toBeNull();
  view.unmount();
  render(<LocalAudioProof userId="u" />);
  expect(document.querySelector('audio')).not.toBeNull();
  expect(installAudioSample).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole('button',{name:'Apagar somente esta amostra'})));
  expect(document.querySelector('audio')).toBeNull();
});

it('does not download if the active service worker cannot serve local audio', async () => {
  vi.mocked(checkLocalAudioWorker).mockRejectedValueOnce(new Error('Atualize o aplicativo'));
  render(<LocalAudioProof userId="u" />);
  fireEvent.click(screen.getByRole('button',{name:'Preparar até 5 áudios para teste'}));
  await screen.findByRole('alert');
  expect(installAudioSample).not.toHaveBeenCalled();
});
