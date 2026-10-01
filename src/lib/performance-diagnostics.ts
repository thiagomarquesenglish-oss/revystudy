const KEY = 'revystudy:performance-diagnostics';
export const DIAGNOSTICS_EVENT = 'revystudy:performance-settings';
export const diagnosticsEnabled = () => { try { return localStorage.getItem(KEY) === 'true'; } catch { return false; } };
export const setDiagnosticsEnabled = (enabled: boolean) => { localStorage.setItem(KEY, String(enabled)); window.dispatchEvent(new Event(DIAGNOSTICS_EVENT)); };
type RequestRecord = {category:string; durationMs:number; status:number|string};
let started = 0;
let active = 0;
let completed = 0;
let failures = 0;
let lagCount = 0;
let maxLag = 0;
let resources = {images:0,audios:0,slowestMs:0};
let recent: RequestRecord[] = [];
const category = (url:string) => url.includes('/api/explain') ? 'IA' : /storage|audio|mp3|m4a/i.test(url) ? 'Mídia/download' : /supabase|rest\/v1/i.test(url) ? 'Dados/sincronização' : 'Outros';
export function startDiagnostics() {
  started = Date.now(); active = completed = failures = lagCount = maxLag = 0;
  resources = {images:0,audios:0,slowestMs:0}; recent = [];
  const original = window.fetch;
  let stopped = false;
  const wrapped: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const time = performance.now(); active++;
    let status:number|string = 'erro';
    try { const response = await original.call(window,input,init); status = response.status; if (!response.ok && !stopped) failures++; return response; }
    catch (error) { if (!stopped) failures++; throw error; }
    finally { if (!stopped) { active--; completed++; recent.push({category:category(url),durationMs:Math.round(performance.now()-time),status}); recent = recent.slice(-50); } }
  };
  window.fetch = wrapped;
  let expected = performance.now() + 2000;
  const timer = setInterval(() => {
    const time = performance.now();
    const lag = Math.max(0,time-expected);
    if (!document.hidden && lag > 200) { lagCount++; maxLag = Math.max(maxLag,Math.round(lag)); }
    expected = time + 2000;
  },2000);
  const visible = () => { expected = performance.now()+2000; };
  document.addEventListener('visibilitychange',visible);
  let observer:PerformanceObserver|undefined;
  try {
    observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        if(entry.initiatorType === 'img') resources.images++;
        if(entry.initiatorType === 'audio') resources.audios++;
        resources.slowestMs = Math.max(resources.slowestMs,Math.round(entry.duration));
      }
    });
    observer.observe({entryTypes:['resource']});
  } catch { /* Resource observation may not be supported. */ }
  return () => { stopped = true; if(window.fetch === wrapped) window.fetch = original; clearInterval(timer); observer?.disconnect(); document.removeEventListener('visibilitychange',visible); };
}
export const performanceSnapshot = () => ({startedAt:started ? new Date(started).toISOString() : null,seconds:started ? Math.round((Date.now()-started)/1000) : 0,activeRequests:active,completedRequests:completed,failedRequests:failures,interfaceDelays:lagCount,maxInterfaceDelayMs:maxLag,resources,recentRequests:[...recent]});
