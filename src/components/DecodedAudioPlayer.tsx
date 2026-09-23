import { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { audioIsRunning, playDecodedAudio, prepareDecodedAudio } from '@/lib/local-audio-engine';

export default function DecodedAudioPlayer({src, centered, autoPlay}: {src:string; centered?:boolean; autoPlay:boolean}) {
  const [buffer,setBuffer]=useState<AudioBuffer>();
  const [busy,setBusy]=useState(true);
  const [playing,setPlaying]=useState(false);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const stop=useRef<()=>void>(()=>{});
  useEffect(()=>{
    let active=true;
    setBusy(true);setError('');setBuffer(undefined);
    const timer=setTimeout(()=>{active=false;setBusy(false);setError('Não foi possível preparar o som local a tempo. Tente novamente.');},15000);
    void prepareDecodedAudio(src).then(value=>{
      if(!active)return;
      clearTimeout(timer);setBuffer(value);setBusy(false);
    }).catch(reason=>{if(active){clearTimeout(timer);setBusy(false);setError(reason instanceof Error?reason.message:'Falha ao preparar áudio local.');}});
    return()=>{active=false;clearTimeout(timer);stop.current();};
  },[src,attempt]);
  const play=()=>{
    if(!buffer)return;
    stop.current();setError('');setBusy(true);
    stop.current=playDecodedAudio(buffer,()=>{setBusy(false);setPlaying(true);},()=>{setBusy(false);setPlaying(false);},message=>{setBusy(false);setPlaying(false);setError(message);});
  };
  useEffect(()=>{
    // Never queue autoplay behind a suspended context: manual tap unlocks it.
    if(buffer&&autoPlay&&attempt===0&&audioIsRunning())play();
    return()=>{stop.current();setPlaying(false);};
  },[buffer,autoPlay]);
  useEffect(()=>{
    const hidden=()=>{if(document.hidden){stop.current();setPlaying(false);if(buffer)setBusy(false);}};
    document.addEventListener('visibilitychange',hidden);
    return()=>document.removeEventListener('visibilitychange',hidden);
  },[buffer]);
  return <div className={`flex flex-col items-center gap-2 ${centered?'self-center':'self-start mt-1'}`}>
    <button type="button" disabled={!buffer||busy} aria-label={!buffer&&busy?'Preparando áudio local':playing?'Pausar áudio':'Reproduzir áudio'} className="shrink-0 w-20 h-20 rounded-full bg-primary/15 hover:bg-primary/25 flex items-center justify-center disabled:opacity-50" onClick={()=>{if(playing){stop.current();setPlaying(false);}else play();}}>
      {busy?<Loader2 className="w-9 h-9 text-primary animate-spin"/>:playing?<Pause className="w-9 h-9 text-primary"/>:<Play className="w-9 h-9 text-primary ml-1"/>}
    </button>
    {error&&<div role="alert" className="max-w-xs text-sm text-center text-destructive"><p>{error}</p><button className="underline p-2" onClick={()=>{stop.current();setPlaying(false);setAttempt(value=>value+1);}}>Tentar novamente</button></div>}
  </div>;
}
