import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getCards } from '@/lib/storage';
import { Flashcard } from '@/lib/types';
import SavedAudioPlayer from '@/components/SavedAudioPlayer';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/PageHeader';

export default function LineByLinePage() {
  const { audioId } = useParams<{ audioId: string }>();
  const navigate = useNavigate();
  const [audioName, setAudioName] = useState('');
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Load audio info
      const { data: audioData } = await supabase
        .from('deck_audios')
        .select('name')
        .eq('id', audioId!)
        .single();
      if (audioData) setAudioName(audioData.name);

      // Load linked cards
      const allCards = await getCards();
      const linked = allCards.filter(c => c.audioId === audioId);
      setCards(linked);
      setLoading(false);
    }
    load();
  }, [audioId]);

  // Extract audio src from card HTML content
  const extractAudioSrc = (html: string): string | null => {
    // Check for tiptap audio node
    const audioNodeMatch = html.match(/data-src="([^"]+)"/);
    if (audioNodeMatch) return audioNodeMatch[1];
    // Check for regular audio tag
    const audioMatch = html.match(/<audio[^>]*src="([^"]+)"/);
    if (audioMatch) return audioMatch[1];
    const sourceMatch = html.match(/<source[^>]*src="([^"]+)"/);
    if (sourceMatch) return sourceMatch[1];
    return null;
  };

  const getCardAudioSrc = (card: Flashcard): string | null => {
    return extractAudioSrc(card.front) || extractAudioSrc(card.back);
  };


  // Strip HTML tags for display
  const stripHtml = (html: string): string => {
    // Remove audio nodes entirely
    let clean = html.replace(/<div[^>]*data-audio[^>]*>.*?<\/div>/gs, '');
    // Remove explanation blocks entirely
    clean = clean.replace(/<div[^>]*data-explanation[^>]*>.*?<\/div>/gs, '');
    clean = clean.replace(/<img[^>]*>/g, '[imagem]');
    clean = clean.replace(/<[^>]*>/g, '');
    return clean.trim();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background safe-page">
        <PageHeader title="" onBack={() => navigate(-1)} />
        <main className="max-w-3xl mx-auto px-3 space-y-3" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background safe-page">
      <PageHeader title={audioName || 'Linha a linha'} onBack={() => navigate(-1)} />
      <main className="max-w-3xl mx-auto px-3 space-y-2 pb-12" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
        {cards.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">Nenhum cartão vinculado a esta reprodução.</p>
          </div>
        ) : (
          cards.map((card, index) => {
            const audioSrc = getCardAudioSrc(card);
            const frontText = stripHtml(card.front);
            const backText = stripHtml(card.back);

            return (
              <div
                key={card.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border"
              >
                <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{index + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{frontText}</p>
                  {backText && <p className="text-xs text-muted-foreground truncate mt-0.5">{backText}</p>}
                </div>
                {audioSrc && (
                  <SavedAudioPlayer src={audioSrc} compact />
                )}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
