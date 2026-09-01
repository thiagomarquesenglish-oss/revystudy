import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Calls `onVisible` when the component's route becomes the active pathname.
 * Skips the initial mount (handled by useEffect([], [])).
 */
export function useTabVisible(path: string, onVisible: () => void) {
  const { pathname } = useLocation();
  const mountedRef = useRef(false);

  useEffect(() => {
    if (pathname === path) {
      if (mountedRef.current) {
        onVisible();
      } else {
        mountedRef.current = true;
      }
    }
  }, [pathname, path, onVisible]);
}
