import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Volume2, MessageSquareText, CheckCircle2, X, Play, Pause, Upload } from 'lucide-react';
import { addCard, getDeckAudios } from '@/lib/storage';
import { buildSituationHtml, escapeHtml } from '@/lib/situation';
import { supabase } from '@/integrations/supabase/client';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
function extension(file: File) { return file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (file.type.startsWith('image/') ? 'jpg' : 'mp3'); }

function DropBox({ kind, file, preview, onFile, onClear }: { kind: 'image'|'audio'; file: File|null; preview: string; onFile:(file:File)=>void; onClear:()=>void }) {
  const input=useRef<HTMLInputElement>(null), audio=useRef<HTMLAudioElement>(null); const [drag,setDrag]=useState(false), [playing,setPlaying]=useState(false);
  const choose=(candidate?:File)=>{if(!candidate)return;if(!candidate.type.startsWith(`${kind}/`)){toast.error(`Selecione um arquivo de ${kind==='image'?'imagem':'áudio'}.`);return;}if(candidate.size>MAX_MEDIA_BYTES){toast.error('O arquivo deve ter no máximo 25 MB.');return;}onFile(candidate);};
  return <div className="space-y-2"><Label>{kind==='image'?'Imagem sem texto':'Áudio em inglês'}</Label><div role="button" tabIndex={0} aria-label={kind==='image'?'Adicionar imagem':'Adicionar áudio'}
    onClick={()=>!file&&input.current?.click()} onKeyDown={e=>{if(!file&&(e.key==='Enter'||e.key===' '))input.current?.click();}}
    onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);choose(e.dataTransfer.files[0])}}
    className={`relative min-h-44 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition-colors ${drag?'border-primary bg-primary/10':'border-border bg-background hover:border-primary/60'}`}>
    <input ref={input} type="file" accept={`${kind}/*`} className="hidden" onChange={e=>{choose(e.target.files?.[0]);e.target.value=''}}/>
    {!file?<><div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">{kind==='image'?<ImagePlus className="h-6 w-6 text-primary"/>:<Volume2 className="h-6 w-6 text-primary"/>}</div><strong>Arraste {kind==='image'?'a imagem':'o áudio'} aqui</strong><span className="text-xs text-muted-foreground mt-1">ou toque para escolher</span></>:
      kind==='image'?<img src={preview} alt="Pré-visualização da situação" className="max-h-72 w-full object-contain"/>:<div className="flex flex-col items-center gap-3 px-4"><audio ref={audio} src={preview} preload="metadata" onEnded={()=>setPlaying(false)} onPause={()=>setPlaying(false)}/><Button type="button" className="h-20 w-20 rounded-full" aria-label={playing?'Pausar prévia do áudio':'Ouvir prévia do áudio'} onClick={e=>{e.stopPropagation();if(!audio.current)return;if(playing)audio.current.pause();else void audio.current.play().then(()=>setPlaying(true)).catch(()=>toast.error('Não foi possível reproduzir este áudio.'));}}>{playing?<Pause className="h-8 w-8"/>:<Play className="h-8 w-8"/>}</Button><span className="max-w-full truncate text-sm">{file.name}</span></div>}
    {file&&<button type="button" aria-label={`Remover ${kind==='image'?'imagem':'áudio'}`} onClick={e=>{e.stopPropagation();onClear()}} className="absolute right-2 top-2 rounded-full bg-background/90 p-2 text-destructive"><X className="h-5 w-5"/></button>}
  </div></div>;
}

export default function SituationAddForm({ deckId }: { deckId: string }) {
  const [english,setEnglish]=useState(''),[context,setContext]=useState(''),[portuguese,setPortuguese]=useState('');
  const [image,setImage]=useState<File|null>(null),[audio,setAudio]=useState<File|null>(null),[imageUrl,setImageUrl]=useState(''),[audioUrl,setAudioUrl]=useState('');
  const [audioId,setAudioId]=useState('none'),[audios,setAudios]=useState<{id:string;name:string}[]>([]),[saving,setSaving]=useState(false); const lock=useRef(false);
  useEffect(()=>{void getDeckAudios(deckId).then(rows=>setAudios(rows.map(({id,name})=>({id,name}))));},[deckId]);
  const setPickedImage=(file:File)=>{if(imageUrl)URL.revokeObjectURL(imageUrl);setImage(file);setImageUrl(URL.createObjectURL(file))};
  const setPickedAudio=(file:File)=>{if(audioUrl)URL.revokeObjectURL(audioUrl);setAudio(file);setAudioUrl(URL.createObjectURL(file));setAudioId('none')};
  const ready=!!english.trim()&&!!context.trim()&&!!portuguese.trim()&&!!image&&(!!audio||audioId!=='none');
  const save=async(e:React.FormEvent)=>{e.preventDefault();if(!ready||lock.current||!image)return;lock.current=true;setSaving(true);const uploaded:string[]=[];
    try{if(!navigator.onLine)throw new Error('Conecte-se à internet para enviar a imagem e o áudio.');const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Sua sessão expirou.');
      const upload=async(file:File)=>{const path=`${user.id}/situations/${deckId}/${crypto.randomUUID()}.${extension(file)}`;const {error}=await supabase.storage.from('card-media').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;uploaded.push(path);return supabase.storage.from('card-media').getPublicUrl(path).data.publicUrl};
      const imagePublic=await upload(image);const audioPublic=audio?await upload(audio):'';
      const media=`<img src="${escapeHtml(imagePublic)}" alt="Situação visual">${audioPublic?`<div data-audio="true" data-src="${escapeHtml(audioPublic)}" data-filename="${escapeHtml(audio!.name)}" class="audio-node"><audio src="${escapeHtml(audioPublic)}" class="audio-node-element"></audio></div>`:''}`;
      const html=buildSituationHtml({english:english.trim(),context:context.trim(),portuguese:portuguese.trim(),mediaHtml:media});await addCard(deckId,html.front,html.back,audioId==='none'?null:audioId,'standard',english.trim());
      URL.revokeObjectURL(imageUrl);if(audioUrl)URL.revokeObjectURL(audioUrl);setEnglish('');setContext('');setPortuguese('');setImage(null);setAudio(null);setImageUrl('');setAudioUrl('');setAudioId('none');toast.success('Situação criada!',{description:'Compreensão, produção e ditado foram configurados automaticamente.'});
    }catch(error){if(uploaded.length)void supabase.storage.from('card-media').remove(uploaded);toast.error(error instanceof Error?error.message:'Não foi possível criar a situação.');}finally{lock.current=false;setSaving(false)}};
  return <form id="situation-form" onSubmit={save} className="space-y-5">
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4"><div className="flex gap-2"><Upload className="h-5 w-5 text-primary"/><div><h2 className="font-bold">1. Imagem e áudio</h2><p className="text-xs text-muted-foreground">Arraste cada arquivo para seu próprio espaço.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><DropBox kind="image" file={image} preview={imageUrl} onFile={setPickedImage} onClear={()=>{if(imageUrl)URL.revokeObjectURL(imageUrl);setImage(null);setImageUrl('')}}/><DropBox kind="audio" file={audio} preview={audioUrl} onFile={setPickedAudio} onClear={()=>{if(audioUrl)URL.revokeObjectURL(audioUrl);setAudio(null);setAudioUrl('')}}/></div>
      {audios.length>0&&<div><Label>Ou escolher um áudio da biblioteca</Label><Select value={audioId} onValueChange={value=>{setAudioId(value);if(value!=='none'){if(audioUrl)URL.revokeObjectURL(audioUrl);setAudio(null);setAudioUrl('')}}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Enviar áudio acima</SelectItem>{audios.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>}
    </section>
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4"><div className="flex gap-2"><MessageSquareText className="h-5 w-5 text-primary"/><h2 className="font-bold">2. Frases</h2></div><div><Label htmlFor="english">Frase em inglês</Label><Input id="english" lang="en" value={english} onChange={e=>setEnglish(e.target.value)} placeholder="The kitchen is over here."/><p className="mt-1 text-xs text-muted-foreground">Esta mesma frase será usada para corrigir o ditado.</p></div><div><Label htmlFor="context">Contexto em inglês</Label><Input id="context" lang="en" value={context} onChange={e=>setContext(e.target.value)} placeholder="You are showing a guest around your house."/></div><div><Label htmlFor="portuguese">Frase em português</Label><Input id="portuguese" value={portuguese} onChange={e=>setPortuguese(e.target.value)} placeholder="A cozinha fica aqui."/><p className="mt-1 text-xs text-muted-foreground">Serve apenas como apoio temporário e desaparece com seu progresso.</p></div></section>
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4"><h2 className="font-bold mb-3">Três exercícios automáticos</h2>{[['Compreensão','Áudio ou inglês → entender'],['Produção','Imagem + contexto → falar em inglês'],['Ditado','Áudio → escrever a frase em inglês']].map(([a,b])=><div key={a} className="flex gap-2 py-1.5 text-sm"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5"/><span><strong>{a}:</strong> {b}</span></div>)}</section>
    <Button className="w-full h-12" disabled={!ready||saving}>{saving?'Enviando e criando…':'Criar situação'}</Button>{!ready&&<p className="text-xs text-center text-muted-foreground">Complete a imagem, o áudio e os três campos de texto.</p>}
  </form>;
}
