import {useRef,useState,type ReactNode} from 'react';
import {Copy,Pause,Play} from 'lucide-react';
import {toast} from 'sonner';
import {supabase} from '@/integrations/supabase/client';
import {buildImageGenerationPrompt,buildSituationHtml,escapeHtml,readSituation} from '@/lib/situation';
import {updateCard} from '@/lib/storage';
import type {Flashcard} from '@/lib/types';

function mediaDetails(html:string){
  const root=document.createElement('div');root.innerHTML=html;
  return {image:root.querySelector('img')?.getAttribute('src')||'',audio:root.querySelector('[data-audio]')?.getAttribute('data-src')||root.querySelector('audio')?.getAttribute('src')||'',audioName:root.querySelector('[data-audio]')?.getAttribute('data-filename')||'Áudio da situação'};
}
function extension(file:File){return file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g,'')||(file.type.startsWith('image/')?'jpg':'mp3')}

export default function QuickCardMedia({card,onSaved,children}:{card:Flashcard;onSaved:()=>void;children:ReactNode}){
  const situation=readSituation(card.front,card.back),existing=situation?mediaDetails(situation.mediaHtml):{image:'',audio:'',audioName:''};
  const [busy,setBusy]=useState<'image'|'audio'|null>(null),[playing,setPlaying]=useState(false),[dragging,setDragging]=useState(false),audioRef=useRef<HTMLAudioElement>(null);
  if(!situation)return <div className="relative group overflow-hidden rounded-2xl border border-border bg-card">{children}</div>;
  const prompt=situation.pedagogy?.imagePrompt?.trim()||'';
  const copy=async()=>{if(!prompt){toast.info('Este cartão não possui prompt de imagem.');return}await navigator.clipboard.writeText(buildImageGenerationPrompt(situation));toast.success('Prompt completo da imagem copiado!')};
  const copyEnglish=async()=>{await navigator.clipboard.writeText(situation.english);toast.success('Frase em inglês copiada!')};
  const saveFile=async(file:File,kind:'image'|'audio')=>{
    if(busy)return;
    if(kind==='image'&&!file.type.startsWith('image/')){toast.error('Solte um arquivo de imagem.');return}
    if(kind==='audio'&&!file.type.startsWith('audio/')){toast.error('Solte um arquivo de áudio.');return}
    setBusy(kind);let path='';
    try{
      if(!navigator.onLine)throw new Error('Conecte-se à internet para enviar a mídia.');
      const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Sua sessão expirou.');
      path=`${user.id}/situations/${card.deckId}/${crypto.randomUUID()}.${extension(file)}`;
      const {error}=await supabase.storage.from('card-media').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;
      const url=supabase.storage.from('card-media').getPublicUrl(path).data.publicUrl;
      const image=kind==='image'?url:existing.image,audio=kind==='audio'?url:existing.audio,audioName=kind==='audio'?file.name:existing.audioName;
      const media=`${image?`<img src="${escapeHtml(image)}" alt="Situação visual">`:''}${audio?`<div data-audio="true" data-src="${escapeHtml(audio)}" data-filename="${escapeHtml(audioName)}" class="audio-node"><audio src="${escapeHtml(audio)}" class="audio-node-element"></audio></div>`:''}`;
      const html=buildSituationHtml({...situation,mediaHtml:media});
      await updateCard(card.id,{front:html.front,back:html.back,dictationAnswer:situation.english});
      toast.success(kind==='image'?'Imagem adicionada!':'Áudio adicionado!');onSaved();
    }catch(error){if(path)void supabase.storage.from('card-media').remove([path]);toast.error(error instanceof Error?error.message:'Não foi possível adicionar a mídia.')}finally{setBusy(null)}
  };
  const drop=(event:React.DragEvent)=>{event.preventDefault();event.stopPropagation();setDragging(false);const file=event.dataTransfer.files[0];if(!file)return;if(file.type.startsWith('image/'))void saveFile(file,'image');else if(file.type.startsWith('audio/'))void saveFile(file,'audio');else toast.error('Solte uma imagem ou um áudio.')};
  return <div className={`relative group overflow-hidden rounded-2xl border bg-card transition-colors ${dragging?'border-primary ring-2 ring-primary/40':'border-border'}`} onDragEnter={e=>{e.preventDefault();setDragging(true)}} onDragOver={e=>e.preventDefault()} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false)}} onDrop={drop}>
    {children}
    {busy&&<div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 text-sm font-medium">{busy==='image'?'Salvando imagem…':'Salvando áudio…'}</div>}
    <div className={`grid ${existing.audio?'grid-cols-3':'grid-cols-2'} gap-1.5 border-t border-border p-2`} onClick={event=>event.stopPropagation()}>
      <button type="button" onClick={copy} className="min-h-12 rounded-lg bg-secondary px-1.5 text-[11px] flex flex-col items-center justify-center gap-1"><Copy className="h-4 w-4"/>Prompt</button>
      <button type="button" onClick={copyEnglish} className="min-h-12 rounded-lg bg-secondary px-1.5 text-[11px] flex flex-col items-center justify-center gap-1"><Copy className="h-4 w-4"/>Frase</button>
      {existing.audio&&<div className="flex min-h-12 items-center justify-center rounded-lg bg-secondary"><audio ref={audioRef} src={existing.audio} onEnded={()=>setPlaying(false)} onPause={()=>setPlaying(false)}/><button type="button" aria-label={playing?'Pausar áudio':'Ouvir áudio'} className="rounded-full bg-primary/15 p-2 text-primary" onClick={()=>{const audio=audioRef.current;if(!audio)return;if(playing)audio.pause();else void audio.play().then(()=>setPlaying(true)).catch(()=>toast.error('Não foi possível reproduzir o áudio.'))}}>{playing?<Pause className="h-5 w-5"/>:<Play className="h-5 w-5"/>}</button></div>}
    </div>
  </div>;
}
