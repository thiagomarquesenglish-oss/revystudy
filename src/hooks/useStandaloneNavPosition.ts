import { useLayoutEffect, type RefObject } from 'react';

// WebKit can restore a stale fixed-bottom position when an installed app opens.
// Anchor to the visible viewport instead; the nav's measured height already
// includes the home-indicator inset, so that inset must not be added again.
export function useStandaloneNavPosition(ref: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone
      || window.matchMedia?.('(display-mode: standalone)').matches;
    const nav = ref.current;
    if (!ios || !standalone || !nav) return;

    const viewport = window.visualViewport;
    let frame = 0;
    let timers: number[] = [];
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        nav.style.top = `${Math.max(0, bottom - nav.getBoundingClientRect().height)}px`;
        nav.dataset.viewportAnchored = 'true';
      });
    };
    const resume = () => {
      timers.forEach(clearTimeout);
      update();
      // iOS settles its viewport asynchronously after launch/resume/rotation.
      timers = [100, 350, 800].map(delay => window.setTimeout(update, delay));
    };
    const visibility = () => { if (document.visibilityState === 'visible') resume(); };
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', visibility);
    resume();
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      observer.disconnect();
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', resume);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', visibility);
      nav.style.removeProperty('top');
      delete nav.dataset.viewportAnchored;
    };
  }, [ref]);
}
