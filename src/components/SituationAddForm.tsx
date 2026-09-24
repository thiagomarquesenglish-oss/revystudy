import { useEffect, useRef, useState } from 'react';
import SavedAudioPlayer from './SavedAudioPlayer';
import { ImagePlus, Volume2, MessageSquareText, CheckCircle2, X, Play, Pause, Upload } from 'lucide-react';
import { addCard, getDeckAudios } from '@/lib/storage';
import { buildSituationHtml, escapeHtml } from '@/lib/situation';
import { supabase } from '@/integrations/supabase/client';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import PedagogyFields from './PedagogyFields';
import { manualPedagogy } from '@/lib/curriculum';
import { cardHasPendingSync, syncOfflineQueue } from '@/lib/sync';

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
function extension(file: File) { return file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (file.type.startsWith('image/') ? 'jpg' : 'mp3'); }

export function MediaDropBox({ kind, file, preview, fileName, onFile, onClear }: { kind: 'image'|'audio'; file: File|null; preview: string; fileName?: string; onFile:(file:File)=>void; onClear:()=>void }) {
  const input=useRef<HTMLInputElement>(null); const [drag,setDrag]=useState(false);
  const hasMedia=!!file||!!preview;
  const choose=(candidate?:File)=>{if(!candidate)return;if(!candidate.type.startsWith(`${kind}/`)){toast.error(`Selecione um arquivo de ${kind==='image'?'imagem':'áudio'}.`);return;}if(candidate.size>MAX_MEDIA_BYTES){toast.error('O arquivo deve ter no máximo 25 MB.');return;}onFile(candidate);};
  return <div className="space-y-2"><Label>{kind==='image'?'Imagem sem texto':'Áudio em inglês'}</Label><div role="button" tabIndex={0} aria-label={kind==='image'?'Adicionar imagem':'Adicionar áudio'}
    onClick={()=>!hasMedia&&input.current?.click()} onKeyDown={e=>{if(!hasMedia&&(e.key==='Enter'||e.key===' '))input.current?.click();}}
    onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);choose(e.dataTransfer.files[0])}}
    className={`relative min-h-44 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition-colors ${drag?'border-primary bg-primary/10':'border-border bg-background hover:border-primary/60'}`}>
    <input ref={input} type="file" accept={`${kind}/*`} className="hidden" onChange={e=>{choose(e.target.files?.[0]);e.target.value=''}}/>
    {!hasMedia?<><div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">{kind==='image'?<ImagePlus className="h-6 w-6 text-primary"/>:<Volume2 className="h-6 w-6 text-primary"/>}</div><strong>Arraste {kind==='image'?'a imagem':'o áudio'} aqui</strong><span className="text-xs text-muted-foreground mt-1">ou toque para escolher</span></>:
      kind==='image'?<img src={preview} alt="Pré-visualização da situação" className="max-h-72 w-full object-contain"/>:<div className="flex flex-col items-center gap-3 px-4"><SavedAudioPlayer src={preview} /><span className="max-w-full truncate text-sm">{file?.name||fileName||'Áudio da situação'}</span></div>}
    {hasMedia&&<button type="button" aria-label={`Remover ${kind==='image'?'imagem':'áudio'}`} onClick={e=>{e.stopPropagation();onClear()}} className="absolute right-2 top-2 rounded-full bg-background/90 p-2 text-destructive"><X className="h-5 w-5"/></button>}
  </div></div>;
}

export default function SituationAddForm({ deckId }: { deckId: string }) {
  const [stage,setStage]=useState(0),[hint,setHint]=useState('');
  const [english,setEnglish]=useState(''),[portuguese,setPortuguese]=useState('');
  const [image,setImage]=useState<File|null>(null),[audio,setAudio]=useState<File|null>(null),[imageUrl,setImageUrl]=useState(''),[audioUrl,setAudioUrl]=useState('');
  const [audioId,setAudioId]=useState('none'),[audios,setAudios]=useState<{id:string;name:string}[]>([]),[pending,setPending]=useState(0); const lock=useRef(false);
  useEffect(()=>{void getDeckAudios(deckId).then(rows=>setAudios(rows.map(({id,name})=>({id,name}))));},[deckId]);
  const setPickedImage=(file:File)=>{if(imageUrl)URL.revokeObjectURL(imageUrl);setImage(file);setImageUrl(URL.createObjectURL(file))};
  const setPickedAudio=(file:File)=>{if(audioUrl)URL.revokeObjectURL(audioUrl);setAudio(file);setAudioUrl(URL.createObjectURL(file));setAudioId('none')};
  const ready=!!english.trim()&&!!portuguese.trim()&&!!image&&(!!audio||audioId!=='none');
  const save=(e:React.FormEvent)=>{e.preventDefault();if(!ready||lock.current||!image)return;if(!navigator.onLine){toast.error('Conecte-se à internet para enviar a imagem e o áudio.');return;}lock.current=true;
    const draft={english:english.trim(),portuguese:portuguese.trim(),hint:hint.trim(),stage,image,audio,audioId};
    if(imageUrl)URL.revokeObjectURL(imageUrl);if(audioUrl)URL.revokeObjectURL(audioUrl);
    setEnglish('');setPortuguese('');setHint('');setImage(null);setAudio(null);setImageUrl('');setAudioUrl('');setAudioId('none');setPending(value=>value+1);
    toast.message('Enviando situação em segundo plano…');
    queueMicrotask(()=>{lock.current=false;});
    void (async()=>{const uploaded:string[]=[];
      try{if(!navigator.onLine)throw new Error('Conecte-se à internet para enviar a imagem e o áudio.');const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Sua sessão expirou.');
        const upload=async(file:File)=>{const path=`${user.id}/situations/${deckId}/${crypto.randomUUID()}.${extension(file)}`;const {error}=await supabase.storage.from('card-media').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;uploaded.push(path);return supabase.storage.from('card-media').getPublicUrl(path).data.publicUrl};
        const [imagePublic,audioPublic]=await Promise.all([upload(draft.image),draft.audio?upload(draft.audio):Promise.resolve('')]);
        const media=`<img src="${escapeHtml(imagePublic)}" alt="Situação visual">${audioPublic?`<div data-audio="true" data-src="${escapeHtml(audioPublic)}" data-filename="${escapeHtml(draft.audio!.name)}" class="audio-node"><audio src="${escapeHtml(audioPublic)}" class="audio-node-element"></audio></div>`:''}`;
        const html=buildSituationHtml({english:draft.english,context:draft.hint,portuguese:draft.portuguese,mediaHtml:media,pedagogy:manualPedagogy(draft.stage)});const created=await addCard(deckId,html.front,html.back,draft.audioId==='none'?null:draft.audioId,'standard',draft.english);
        await syncOfflineQueue().catch(()=>{});
        const pendingCloud=await cardHasPendingSync(created.id);
        if(pendingCloud)toast.error('Situação salva neste navegador, mas ainda não chegou à nuvem. O aplicativo continuará tentando.');
        else toast.success('Situação criada e enviada para a nuvem!',{description:'Ela já pode aparecer nos outros aparelhos.'});
      }catch(error){if(uploaded.length)void supabase.storage.from('card-media').remove(uploaded);toast.error(error instanceof Error?error.message:'Não foi possível criar a situação.');}finally{setPending(value=>Math.max(0,value-1));}
    })();
  };
  return <form id="situation-form" onSubmit={save} className="space-y-5">
    <PedagogyFields stage={stage} onStage={setStage} hint={hint} onHint={setHint}/>
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4"><div className="flex gap-2"><Upload className="h-5 w-5 text-primary"/><div><h2 className="font-bold">1. Imagem e áudio</h2><p className="text-xs text-muted-foreground">Arraste cada arquivo para seu próprio espaço.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><MediaDropBox kind="image" file={image} preview={imageUrl} onFile={setPickedImage} onClear={()=>{if(imageUrl)URL.revokeObjectURL(imageUrl);setImage(null);setImageUrl('')}}/><MediaDropBox kind="audio" file={audio} preview={audioUrl} onFile={setPickedAudio} onClear={()=>{if(audioUrl)URL.revokeObjectURL(audioUrl);setAudio(null);setAudioUrl('')}}/></div>
      {audios.length>0&&<div><Label>Ou escolher um áudio da biblioteca</Label><Select value={audioId} onValueChange={value=>{setAudioId(value);if(value!=='none'){if(audioUrl)URL.revokeObjectURL(audioUrl);setAudio(null);setAudioUrl('')}}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Enviar áudio acima</SelectItem>{audios.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>}
    </section>
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4"><div className="flex gap-2"><MessageSquareText className="h-5 w-5 text-primary"/><h2 className="font-bold">2. Frases</h2></div><div><Label htmlFor="english">Frase em inglês</Label><Input id="english" lang="en" value={english} onChange={e=>setEnglish(e.target.value)} placeholder="The kitchen is over here."/><p className="mt-1 text-xs text-muted-foreground">Esta mesma frase será usada para corrigir o ditado.</p></div><div><Label htmlFor="portuguese">Frase em português</Label><Input id="portuguese" value={portuguese} onChange={e=>setPortuguese(e.target.value)} placeholder="A cozinha fica aqui."/><p className="mt-1 text-xs text-muted-foreground">Serve como apoio quando você precisar consultar o significado.</p></div></section>
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4"><h2 className="font-bold mb-3">Três exercícios automáticos</h2>{[['Compreensão','Áudio ou inglês → entender'],['Produção','Imagem + contexto → falar em inglês'],['Ditado','Áudio → escrever a frase em inglês']].map(([a,b])=><div key={a} className="flex gap-2 py-1.5 text-sm"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5"/><span><strong>{a}:</strong> {b}</span></div>)}</section>
    <Button className="w-full h-12" disabled={!ready}>Criar situação</Button>{pending>0&&<p role="status" className="text-xs text-center text-primary">{pending} {pending===1?'situação sendo enviada':'situações sendo enviadas'} em segundo plano. Você já pode cadastrar outra.</p>}{!ready&&pending===0&&<p className="text-xs text-center text-muted-foreground">Complete a imagem, o áudio e as duas frases.</p>}
  </form>;
}
