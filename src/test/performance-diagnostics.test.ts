import { afterEach, expect, it, vi } from 'vitest';
import { performanceSnapshot, startDiagnostics } from '@/lib/performance-diagnostics';
afterEach(() => vi.unstubAllGlobals());
it('records failures without recording private URLs and restores fetch on shutdown',async () => {
  const original = vi.fn().mockResolvedValue({ok:false,status:429});
  vi.stubGlobal('fetch',original);
  const stop = startDiagnostics();
  try {
    await fetch('/api/explain?secret=private');
    const data = performanceSnapshot();
    expect(data.completedRequests).toBe(1);
    expect(data.activeRequests).toBe(0);
    expect(data.failedRequests).toBe(1);
    expect(data.recentRequests[0].category).toBe('IA');
    expect(JSON.stringify(data)).not.toContain('private');
  } finally {stop();}
  expect(window.fetch).toBe(original);
});
