import {useRef,useState} from 'react';
import {Copy,ImagePlus,Pause,Play,Volume2} from 'lucide-react';
import {toast} from 'sonner';
import {supabase} from '@/integrations/supabase/client';
import {buildSituationHtml,escapeHtml,readSituation} from '@/lib/situation';
import {updateCard} from '@/lib/storage';
import type {Flashcard} from '@/lib/types';

function mediaDetails(html:string){
  const root=document.createElement('div');root.innerHTML=html;
  return {image:root.querySelector('img')?.getAttribute('src')||'',audio:root.querySelector('[data-audio]')?.getAttribute('data-src')||root.querySelector('audio')?.getAttribute('src')||'',audioName:root.querySelector('[data-audio]')?.getAttribute('data-filename')||'Áudio da situação'};
}
function extension(file:File){return file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g,'')||(file.type.startsWith('image/')?'jpg':'mp3')}

export default function QuickCardMedia({card,onSaved}:{card:Flashcard;onSaved:()=>void}){
  const situation=readSituation(card.front,card.back),existing=situation?mediaDetails(situation.mediaHtml):{image:'',audio:'',audioName:''};
  const [busy,setBusy]=useState<'image'|'audio'|null>(null),[playing,setPlaying]=useState(false),audioRef=useRef<HTMLAudioElement>(null);
  if(!situation)return null;
  const prompt=situation.pedagogy?.imagePrompt?.trim()||'';
  const copy=async()=>{if(!prompt){toast.info('Este cartão não possui prompt de imagem.');return}await navigator.clipboard.writeText(`${prompt}\n\nFormato obrigatório: imagem quadrada, proporção 1:1. Não inclua texto, letras, legendas ou marcas d’água.`);toast.success('Prompt da imagem copiado!')};
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
  const drop=(kind:'image'|'audio')=>(event:React.DragEvent)=>{event.preventDefault();event.stopPropagation();const file=event.dataTransfer.files[0];if(file)void saveFile(file,kind)};
  return <div className="grid grid-cols-3 gap-1.5 border-t border-border p-2" onClick={event=>event.stopPropagation()}>
    <button type="button" onClick={copy} className="min-h-12 rounded-lg bg-secondary px-1.5 text-[11px] flex flex-col items-center justify-center gap-1"><Copy className="h-4 w-4"/>Prompt</button>
    <label onDragOver={e=>e.preventDefault()} onDrop={drop('image')} className="min-h-12 rounded-lg bg-secondary px-1.5 text-[11px] flex cursor-pointer flex-col items-center justify-center gap-1"><ImagePlus className="h-4 w-4"/>{busy==='image'?'Enviando…':existing.image?'Trocar imagem':'Soltar imagem'}<input className="sr-only" type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];if(file)void saveFile(file,'image');e.target.value=''}}/></label>
    <div onDragOver={e=>e.preventDefault()} onDrop={drop('audio')} className="min-h-12 rounded-lg bg-secondary px-1.5 text-[11px] flex items-center justify-center gap-1"><label className="flex cursor-pointer flex-col items-center gap-1"><Volume2 className="h-4 w-4"/>{busy==='audio'?'Enviando…':existing.audio?'Trocar':'Soltar áudio'}<input className="sr-only" type="file" accept="audio/*" onChange={e=>{const file=e.target.files?.[0];if(file)void saveFile(file,'audio');e.target.value=''}}/></label>{existing.audio&&<><audio ref={audioRef} src={existing.audio} onEnded={()=>setPlaying(false)} onPause={()=>setPlaying(false)}/><button type="button" aria-label={playing?'Pausar áudio':'Ouvir áudio'} className="rounded-full bg-primary/15 p-1.5 text-primary" onClick={()=>{const audio=audioRef.current;if(!audio)return;if(playing)audio.pause();else void audio.play().then(()=>setPlaying(true)).catch(()=>toast.error('Não foi possível reproduzir o áudio.'))}}>{playing?<Pause className="h-4 w-4"/>:<Play className="h-4 w-4"/>}</button></>}</div>
  </div>;
}
