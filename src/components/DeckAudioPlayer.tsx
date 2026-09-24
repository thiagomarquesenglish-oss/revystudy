import { forwardRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ListMusic } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SavedAudioPlayer, { type SavedAudioHandle } from './SavedAudioPlayer';
export type DeckAudioPlayerHandle = SavedAudioHandle;
interface Props { audio: { id: string; name: string; file_path: string }; onDeleted: () => void; hideDelete?: boolean; onEnded?: () => void }
const DeckAudioPlayer = forwardRef<DeckAudioPlayerHandle, Props>(({ audio, onEnded }, ref) => {
  const [duration, setDuration] = useState(0);
  const navigate = useNavigate();
  const url = supabase.storage.from('deck-audios').getPublicUrl(audio.file_path).data.publicUrl;
  return <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border">
    <SavedAudioPlayer ref={ref} src={url} compact onEnded={onEnded} onDuration={setDuration} />
    <div className="flex-1 min-w-0"><p className="font-semibold truncate">{audio.name}</p>
      {duration > 0 && <p className="text-xs text-muted-foreground">{Math.floor(duration / 60)}:{String(Math.round(duration % 60)).padStart(2, '0')}</p>}
    </div>
    <button onClick={event => { event.stopPropagation(); navigate(`/audio/${audio.id}/lines`); }} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0" title="Estudo linha a linha">
      <ListMusic className="w-4 h-4" /><span className="hidden sm:inline">Estudar linha a linha</span>
    </button>
  </div>;
});
DeckAudioPlayer.displayName = 'DeckAudioPlayer';
export default DeckAudioPlayer;
