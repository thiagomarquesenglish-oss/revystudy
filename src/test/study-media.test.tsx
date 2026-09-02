import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StudyMedia from '@/components/StudyMedia';
import { imageSources, prepareImage } from '@/lib/study-media';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('study media', () => {
  it('deduplicates image sources and ignores empty sources', () => {
    expect(imageSources('<img src="https://example.com/a.png"><img src="https://example.com/a.png">'))
      .toEqual(['https://example.com/a.png']);
  });
  it('shows text-only cards immediately', () => {
    render(<StudyMedia html="hello"><p>Hello</p></StudyMedia>);
    expect(screen.getByText('Hello')).toBeVisible();
  });
  it('waits for image decoding before mounting audio and text, reuses the preload', async () => {
    let loaded: (() => void) | undefined;
    const decode = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('Image', class {
      onerror = null;
      set onload(fn: (() => void) | null) { if (fn) loaded = fn; }
      decode = decode;
      set src(_src: string) {}
    });
    const html = '<img src="https://example.com/ready.png">';
    const pending = prepareImage('https://example.com/ready.png');
    expect(prepareImage('https://example.com/ready.png')).toBe(pending);
    render(<StudyMedia html={html}><p>Complete card</p></StudyMedia>);
    expect(screen.queryByText('Complete card')).toBeNull();
    await act(async () => { loaded!(); await pending; });
    expect(decode).toHaveBeenCalledOnce();
    expect(screen.getByText('Complete card')).toBeVisible();
  });
  it('does not let a failed image trap the learner', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', class { onload = null; onerror = null; src = ''; });
    render(<StudyMedia html='<img src="https://example.com/missing.png">'><p>Still available</p></StudyMedia>);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(screen.getByText('Still available')).toBeVisible();
  });
});
