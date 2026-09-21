// Local, in-memory geometry only: no account, card data or network requests.
const samples: Record<string, unknown>[] = [];
export function captureNavigationGeometry(reason: string) {
  const frame = document.querySelector<HTMLElement>('.navigation-viewport');
  const nav = document.querySelector<HTMLElement>('.navigation-capsule');
  if (!frame || !nav) return;
  const rect = (element: HTMLElement) => {
    const r = element.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
  };
  const viewport = window.visualViewport;
  const style = getComputedStyle(frame);
  samples.push({
    reason, elapsedMs: Math.round(performance.now()),
    tab: nav.querySelector('[aria-current="page"]')?.getAttribute('aria-label'),
    screen: { width: screen.width, height: screen.height, pixelRatio: devicePixelRatio },
    innerHeight: window.innerHeight, clientHeight: document.documentElement.clientHeight,
    scrollY: window.scrollY,
    visualViewport: viewport ? { height: viewport.height, offsetTop: viewport.offsetTop, scale: viewport.scale } : null,
    frame: rect(frame), nav: rect(nav), paddingBottom: style.paddingBottom,
    gapToInnerBottom: window.innerHeight - nav.getBoundingClientRect().bottom,
  });
  // Keep the launch measurements even after subsequent navigation/scrolling.
  if (samples.length > 24) samples.splice(8, 1);
}
export function navigationDiagnostics() {
  return JSON.stringify({
    version: __APP_VERSION__,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone ?? false,
    userAgent: navigator.userAgent, samples,
  }, null, 2);
}
