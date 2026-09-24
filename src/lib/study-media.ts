// Small, session-only lookahead cache. Never download the whole deck at once.
const images = new Map<string, { ready: boolean; promise: Promise<void> }>();

export function imageSources(html: string): string[] {
  const doc = document.createElement('div');
  doc.innerHTML = html;
  return [...new Set(Array.from(doc.querySelectorAll('img')).map(img => img.src).filter(Boolean))];
}

export function prepareImage(src: string): Promise<void> {
  const existing = images.get(src);
  if (existing) return existing.promise;
  const img = new Image();
  const entry = { ready: false, promise: Promise.resolve() };
  entry.promise = new Promise<void>(resolve => {
    const finish = () => {
      clearTimeout(timer);
      img.onload = img.onerror = null;
      entry.ready = true;
      resolve();
    };
    // A missing file must not block studying indefinitely.
    const timer = setTimeout(finish, 6000);
    img.onerror = finish;
    img.onload = () => { if (img.decode) void img.decode().catch(() => {}).then(finish); else finish(); };
    img.src = src;
  });
  images.set(src, entry);
  if (images.size > 32) images.delete(images.keys().next().value!);
  return entry.promise;
}

export function imagesReady(html: string): boolean {
  return imageSources(html).every(src => images.get(src)?.ready);
}

export function prepareHtml(html: string): Promise<void> {
  return Promise.all(imageSources(html).map(prepareImage)).then(() => {});
}
