import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getCards, getDeckAudios, getDecks } from '@/lib/storage';
import { AUTO_AUDIO_EVENT, extractAudioSrcs, isAutoAudioEnabled, prefetchAudios } from '@/lib/saved-audio';

/** Optional (Settings switch): saves every card audio and deck audio in the background. */
export default function AudioAutoDownloader() {
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const signal = { cancelled: false };
    let running = false;
    let lastRun = 0;
    const run = async () => {
      if (running || signal.cancelled || !isAutoAudioEnabled() || !navigator.onLine || document.hidden) return;
      if (lastRun && Date.now() - lastRun < 60_000) return;
      running = true;
      try {
        const [cards, decks] = await Promise.all([getCards(), getDecks()]);
        const sources: string[] = [];
        // Short card audios first, then the longer deck audios.
        for (const card of cards) sources.push(...extractAudioSrcs(card.front), ...extractAudioSrcs(card.back));
        for (const deck of decks) {
          for (const audio of await getDeckAudios(deck.id)) sources.push(supabase.storage.from('deck-audios').getPublicUrl(audio.file_path).data.publicUrl);
        }
        await prefetchAudios(sources, { signal });
      } catch { /* try again on the next open or reconnect */ }
      finally { running = false; lastRun = Date.now(); }
    };
    const start = setTimeout(() => void run(), 3000); // let the app finish loading first
    const again = () => void run();
    const toggled = () => { lastRun = 0; void run(); };
    window.addEventListener(AUTO_AUDIO_EVENT, toggled);
    window.addEventListener('online', again);
    document.addEventListener('visibilitychange', again);
    return () => { signal.cancelled = true; clearTimeout(start); window.removeEventListener('online', again); window.removeEventListener(AUTO_AUDIO_EVENT, toggled); document.removeEventListener('visibilitychange', again); };
  }, [userId]);
  return null;
}
