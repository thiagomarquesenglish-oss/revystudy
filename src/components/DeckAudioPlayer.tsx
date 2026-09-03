import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Play, Pause, ListMusic } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DeckAudio {
  id: string;
  name: string;
  file_path: string;
}

interface DeckAudioPlayerProps {
  audio: DeckAudio;
  onDeleted: () => void;
  hideDelete?: boolean;
  onEnded?: () => void;
}

export interface DeckAudioPlayerHandle {
  play: () => void;
  stop: () => void;
}

const DeckAudioPlayer = forwardRef<DeckAudioPlayerHandle, DeckAudioPlayerProps>(
  ({ audio, onDeleted, hideDelete, onEnded }, ref) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const navigate = useNavigate();

    const { data } = supabase.storage.from('deck-audios').getPublicUrl(audio.file_path);
    const audioUrl = data.publicUrl;

    useImperativeHandle(ref, () => ({
      play: () => {
        const el = audioRef.current;
        if (el) {
          el.play();
          setPlaying(true);
        }
      },
      stop: () => {
        const el = audioRef.current;
        if (el) {
          el.pause();
          el.currentTime = 0;
          setPlaying(false);
        }
      },
    }));

    useEffect(() => {
      const el = audioRef.current;
      if (!el) return;
      const handleEnded = () => {
        setPlaying(false);
        onEnded?.();
      };
      el.addEventListener('ended', handleEnded);
      return () => el.removeEventListener('ended', handleEnded);
    }, [onEnded]);

    const togglePlay = (e: React.MouseEvent) => {
      e.stopPropagation();
      const el = audioRef.current;
      if (!el) return;
      if (playing) {
        el.pause();
      } else {
        el.play();
      }
      setPlaying(!playing);
    };

    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border">
        <button
          onClick={togglePlay}
          className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shrink-0 active:scale-95 transition-transform"
        >
          {playing
            ? <Pause className="w-4 h-4 text-primary-foreground" />
            : <Play className="w-4 h-4 text-primary-foreground ml-0.5" />
          }
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{audio.name}</p>
          {duration > 0 && <p className="text-xs text-muted-foreground mt-0.5">{Math.floor(duration / 60)}:{String(Math.round(duration % 60)).padStart(2, '0')}</p>}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/audio/${audio.id}/lines`);
          }}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
          title="Estudo linha a linha"
        >
          <ListMusic className="w-4 h-4" /><span className="hidden sm:inline">Estudar linha a linha</span>
        </button>
        <audio ref={audioRef} src={audioUrl} preload="metadata" onLoadedMetadata={event => setDuration(event.currentTarget.duration)} />
      </div>
    );
  }
);

DeckAudioPlayer.displayName = 'DeckAudioPlayer';
export default DeckAudioPlayer;
