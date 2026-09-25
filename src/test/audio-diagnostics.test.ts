import { expect, it, vi, afterEach } from 'vitest';
import { audioDiagnosticId, audioDiagnosticReport, audioSnapshot, recordAudio } from '@/lib/audio-diagnostics';

afterEach(() => vi.unstubAllGlobals());
it('bounds the report and does not expose audio URLs in snapshots', () => {
  vi.stubGlobal('__APP_VERSION__', 'test');
  const audio = document.createElement('audio');
  audio.src = 'https://example.com/private.mp3?token=secret';
  const id = audioDiagnosticId();
  for (let i = 0; i < 260; i++) recordAudio('test', id, audioSnapshot(audio));
  const report = audioDiagnosticReport();
  expect(JSON.parse(report).events).toHaveLength(250);
  expect(report).not.toContain('private.mp3');
  expect(report).not.toContain('secret');
});
