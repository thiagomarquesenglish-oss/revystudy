import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
const positions = new Map<string, number>();
export default function NavigationPosition() {
  const location = useLocation();
  const navigation = useNavigationType();
  useLayoutEffect(() => {
    const route = location.pathname + location.search;
    const target = navigation === 'POP' ? positions.get(route) ?? 0 : 0;
    let lastY = target;
    let restoring = true;
    const restore = () => { if (restoring) window.scrollTo(0, target); };
    const stop = () => { restoring = false; observer.disconnect(); };
    const observer = new ResizeObserver(restore);
    observer.observe(document.body);
    restore();
    const timeout = window.setTimeout(stop, 1500);
    const remember = () => { if (!restoring) lastY = window.scrollY; };
    window.addEventListener('scroll', remember, { passive: true });
    window.addEventListener('pointerdown', stop, { passive: true });
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', stop);
    return () => {
      positions.set(route, lastY);
      stop(); window.clearTimeout(timeout);
      window.removeEventListener('scroll', remember);
      window.removeEventListener('pointerdown', stop);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [location.key, location.pathname, location.search, navigation]);
  return null;
}
