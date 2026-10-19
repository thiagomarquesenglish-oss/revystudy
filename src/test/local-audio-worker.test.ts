import { readFileSync } from 'node:fs';
import { URL as FileURL } from 'node:url';
import { Blob as NativeBlob } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Match Node's Response implementation; jsdom's Blob is a different realm.
beforeEach(() => vi.stubGlobal('Blob', NativeBlob));
afterEach(() => vi.unstubAllGlobals());

const worker = readFileSync(new FileURL('../../public/local-audio-sw.js', import.meta.url), 'utf8');
const origin = 'https://revystudy.vercel.app';
const path = `/__local_audio/v1/user-1/${'a'.repeat(64)}.mp3`;
const bytes = new Uint8Array([73, 68, 51, 0, 255, 251, 1, 2, 3, 4]);

function harness(missing = false) {
  let listener: (event: any) => void;
  const cache = { match: vi.fn(async () => missing ? undefined : new Response(bytes)) };
  const caches = { open: vi.fn(async () => cache) };
  const self = { location: { origin }, addEventListener: (_: string, handler: typeof listener) => { listener = handler; } };
  // Exercise the exact classic script shipped to browsers, not a copy of its range implementation.
  new Function('self', 'caches', worker)(self, caches);
  const request = (url = path, headers = {}, method = 'GET') => {
    let response: Promise<Response> | undefined;
    const event = { request: new Request(new URL(url, origin), { headers, method }), respondWith: (work: Promise<Response>) => { response = work; }, stopImmediatePropagation: vi.fn() };
    listener!(event);
    return { response, event };
  };
  return { request, cache };
}

it.each([
  ['bytes=0-1', 0, 1], ['bytes=4-', 4, 9], ['bytes=-3', 7, 9], ['bytes=0-999', 0, 9],
])('serves Safari range %s from the complete local file', async (range, start, end) => {
  const {response,event} = harness().request(path, {Range:range});
  const result = await response!;
  expect(result.status).toBe(206);
  expect(result.headers.get('Content-Range')).toBe(`bytes ${start}-${end}/${bytes.length}`);
  expect(result.headers.get('Content-Length')).toBe(String(end-start+1));
  expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes.slice(start,end+1));
  expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
});

it.each(['bytes=10-', 'bytes=5-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'invalid'])('rejects invalid range %s', async range => {
  const result = await harness().request(path, {Range:range}).response!;
  expect(result.status).toBe(416);
  expect(result.headers.get('Content-Range')).toBe('bytes */10');
});

it('supports complete GET and HEAD, and never returns HTML or a cloud fallback for missing files', async () => {
  const get = await harness().request().response!;
  expect(get.status).toBe(200);
  expect(new Uint8Array(await get.arrayBuffer())).toEqual(bytes);
  const head = await harness().request(path, {}, 'HEAD').response!;
  expect(head.status).toBe(200);
  expect(head.headers.get('Content-Length')).toBe('10');
  expect(await head.text()).toBe('');
  const absent = await harness(true).request().response!;
  expect(absent.status).toBe(404);
  expect(await absent.text()).toBe('');
  expect(absent.headers.get('X-Revy-Local-Audio')).toBe('v1');
});

it('does not intercept the existing cloud player, normal navigation or other origins', () => {
  const {request} = harness();
  expect(request('https://example.com'+path).response).toBeUndefined();
  expect(request('/settings').response).toBeUndefined();
  expect(request('https://example.com/voice.mp3').response).toBeUndefined();
});
