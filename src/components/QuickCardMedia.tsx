import {useRef,useState,type ReactNode} from 'react';
import {Copy,Pause,Play} from 'lucide-react';
import {toast} from 'sonner';
import {supabase} from '@/integrations/supabase/client';
import {escapeHtml,readSituation} from '@/lib/situation';
import {getCardById, updateCard} from '@/lib/storage';
import type {Flashcard} from '@/lib/types';
import {matchesCardMedia} from '@/lib/card-media-filter';

function mediaDetails(html:string){
  const root=document.createElement('div');root.innerHTML=html;
  return {image:root.querySelector('img')?.getAttribute('src')||'',audio:root.querySelector('[data-audio]')?.getAttribute('data-src')||root.querySelector('audio')?.getAttribute('src')||'',audioName:root.querySelector('[data-audio]')?.getAttribute('data-filename')||'Áudio da situação'};
}
function extension(file:File){return file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g,'')||(file.type.startsWith('image/')?'jpg':'mp3')}

export default function QuickCardMedia({card,onSaved,children}:{card:Flashcard;onSaved:()=>void;children:ReactNode}){
  const [savedCard,setSavedCard]=useState<Flashcard|null>(null);
  const shown=savedCard||card;
  const existing=mediaDetails(shown.front+shown.back);
  const situation=readSituation(shown.front,shown.back);
  const english=situation?.english || shown.dictationAnswer || '';
  const prompt=situation?.imagePrompt || situation?.pedagogy?.imagePrompt || situation?.context || '';
  const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);toast.success('Copiado!');}catch{toast.error('Não foi possível copiar. Tente novamente.');}};
  const saving=useRef(false);
  const [busy,setBusy]=useState<'image'|'audio'|null>(null),[playing,setPlaying]=useState(false),[dragging,setDragging]=useState(false),audioRef=useRef<HTMLAudioElement>(null);
  const saveFiles=async(files:File[])=>{
    if(saving.current)return;
    if(files.some(file=>!file.type.startsWith('image/')&&!file.type.startsWith('audio/')) || files.filter(file=>file.type.startsWith('image/')).length>1 || files.filter(file=>file.type.startsWith('audio/')).length>1){toast.error('Solte no máximo uma imagem e um áudio por vez.');return;}
    saving.current=true;setBusy('image');const paths:string[]=[];let committed=false;
    try{
      if(!navigator.onLine)throw new Error('Conecte-se à internet para enviar a mídia.');
      const full=await getCardById(card.id);
      if(!full)throw new Error('Cartão não encontrado. Atualize a biblioteca.');
      const situation=readSituation(full.front,full.back);
      const root=document.createElement('div');root.innerHTML=full.front;
      const back=document.createElement('div');back.innerHTML=full.back;
      const hasImage=matchesCardMedia(full,'has-image');
      const hasAudio=matchesCardMedia(full,'has-audio');
      const missing=files.filter(file=>file.type.startsWith('image/')?!hasImage:!hasAudio);
      if(!missing.length){toast.info('Este cartão já tem essa mídia.');return;}
      const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Sua sessão expirou.');
      for(const file of missing){
        const kind=file.type.startsWith('image/')?'image':'audio';setBusy(kind);
        const path=`${user.id}/situations/${card.deckId}/${crypto.randomUUID()}.${extension(file)}`;
        const {error}=await supabase.storage.from('card-media').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;
        paths.push(path);
        const url=supabase.storage.from('card-media').getPublicUrl(path).data.publicUrl;
        const html=kind==='image'?`<img src="${escapeHtml(url)}" alt="Imagem do cartão">`:`<div data-audio="true" data-src="${escapeHtml(url)}" data-filename="${escapeHtml(file.name)}" class="audio-node"><audio src="${escapeHtml(url)}" class="audio-node-element"></audio></div>`;
        const target=situation ? root.querySelector('[data-situation-media]')||root : kind==='image'?root:back;
        target.insertAdjacentHTML('beforeend',html);
      }
      const updated={front:root.innerHTML,back:back.innerHTML};
      await updateCard(card.id,updated);committed=true;setSavedCard({...full,...updated});
      toast.success('Mídia adicionada ao cartão!');onSaved();
    }catch(error){if(!committed&&paths.length)void supabase.storage.from('card-media').remove(paths);toast.error(error instanceof Error?error.message:'Não foi possível adicionar a mídia.')}finally{saving.current=false;setBusy(null)}
  };
  const drop=(event:React.DragEvent)=>{event.preventDefault();event.stopPropagation();setDragging(false);const files=Array.from(event.dataTransfer.files);if(files.length)void saveFiles(files);};
  return <div className={`relative group overflow-hidden rounded-2xl border bg-card transition-colors ${dragging?'border-primary ring-2 ring-primary/40':'border-border'}`} onDragEnter={e=>{e.preventDefault();setDragging(true)}} onDragOver={e=>e.preventDefault()} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false)}} onDrop={drop}>
    {children}
    {busy&&<div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 text-sm font-medium">{busy==='image'?'Salvando imagem…':'Salvando áudio…'}</div>}
    {(existing.audio||english||prompt)&&<div className="flex items-center justify-evenly gap-1 border-t border-border p-2" onClick={event=>event.stopPropagation()}>
      {prompt&&<button type="button" aria-label="Copiar prompt" onClick={()=>void copy(prompt)} className="flex min-h-11 flex-col items-center justify-center gap-1 px-2 text-xs"><Copy aria-hidden="true" className="h-4 w-4"/>Prompt</button>}
      {english&&<button type="button" aria-label="Copiar inglês" onClick={()=>void copy(english)} className="flex min-h-11 flex-col items-center justify-center gap-1 px-2 text-xs"><Copy aria-hidden="true" className="h-4 w-4"/>Inglês</button>}
      {existing.audio&&<div className="flex min-h-12 items-center justify-center rounded-lg bg-secondary"><audio ref={audioRef} src={existing.audio} onEnded={()=>setPlaying(false)} onPause={()=>setPlaying(false)}/><button type="button" aria-label={playing?'Pausar áudio':'Ouvir áudio'} className="rounded-full bg-primary/15 p-2 text-primary" onClick={()=>{const audio=audioRef.current;if(!audio)return;if(playing)audio.pause();else void audio.play().then(()=>setPlaying(true)).catch(()=>toast.error('Não foi possível reproduzir o áudio.'))}}>{playing?<Pause className="h-5 w-5"/>:<Play className="h-5 w-5"/>}</button></div>}
    </div>}
  </div>;
}
