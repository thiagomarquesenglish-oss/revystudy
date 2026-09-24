import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getCards, getDeckAudios, getDecks } from '@/lib/storage';
import { extractAudioSrcs, prefetchAudios } from '@/lib/saved-audio';

/** Saves every card audio and deck audio on this device in the background, so play never waits for a download. */
export default function AudioAutoDownloader() {
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const signal = { cancelled: false };
    let running = false;
    let lastRun = 0;
    const run = async () => {
      if (running || signal.cancelled || !navigator.onLine || document.hidden) return;
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
    window.addEventListener('online', again);
    document.addEventListener('visibilitychange', again);
    return () => { signal.cancelled = true; clearTimeout(start); window.removeEventListener('online', again); document.removeEventListener('visibilitychange', again); };
  }, [userId]);
  return null;
}
