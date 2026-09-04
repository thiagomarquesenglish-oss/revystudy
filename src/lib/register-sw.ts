/**
 * Guarded service-worker registration.
 * Never registers in development or an iframe, supports ?sw=off kill switch,
 * and frees storage when the browser quota is nearly full (which was
 * crashing the installed PWA on iOS).
 */
const SW_URL = "/sw.js";

async function unregisterAppSW() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => (r.active?.scriptURL ?? r.installing?.scriptURL ?? "").endsWith(SW_URL))
      .map((r) => r.unregister()),
  );
}

async function clearAppCaches() {
  if (!("caches" in window)) return;
  const names = await caches.keys();
  await Promise.allSettled(
    names.filter((n) => /precache|runtime|supabase-api/i.test(n)).map((n) => caches.delete(n)),
  );
}

async function clearLegacyApiCache() {
  if (!("caches" in window)) return;
  const names = await caches.keys();
  await Promise.allSettled(
    names.filter((name) => name === "supabase-api" || name.startsWith("supabase-api-")).map((name) => caches.delete(name)),
  );
}

/** Drops cached responses when storage usage gets close to the quota. */
async function relieveStoragePressure() {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est?.usage || !est?.quota) return;
    if (est.usage / est.quota > 0.8) {
      console.warn("[PWA] Storage quota near limit — clearing caches");
      await clearAppCaches();
    }
  } catch {
    /* ignore */
  }
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";
  const blocked =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    killSwitch;

  if (blocked) {
    await unregisterAppSW();
    if (killSwitch) await clearAppCaches();
    return;
  }

  // API responses are already persisted in IndexedDB. Remove the old Workbox
  // copy so large card HTML is not held twice on memory-constrained iPhones.
  await clearLegacyApiCache();
  await relieveStoragePressure();

  try {
    const hadController = !!navigator.serviceWorker.controller;
    let updateReady = false;
    let lastInteraction = Date.now();
    for (const event of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(event, () => { lastInteraction = Date.now(); }, { passive: true });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) updateReady = true; });
    const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' });
    const check = () => { if (navigator.onLine) void registration.update().catch(() => {}); };
    check();
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    window.setInterval(check, 60 * 60 * 1000);
    window.setInterval(() => {
      // Never interrupt a study, editor, upload, backup, or an open dialog.
      const safePage = ['/', '/decks', '/stats'].includes(location.pathname);
      const editing = document.querySelector('[role="dialog"], [data-state="open"][role="alertdialog"]') || document.activeElement?.matches('input, textarea, [contenteditable="true"]');
      if (updateReady && safePage && !document.hidden && !editing && Date.now() - lastInteraction > 10000) {
        updateReady = false; location.reload();
      }
    }, 2000);
  } catch (err) {
    console.error("[PWA] SW registration failed", err);
  }
}
