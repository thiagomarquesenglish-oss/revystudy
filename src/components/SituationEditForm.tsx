import { useState } from 'react';
import { Copy, MessageSquareText, Upload } from 'lucide-react';
import { updateCard } from '@/lib/storage';
import { buildImageGenerationPrompt, buildSituationHtml, escapeHtml, type SituationContent } from '@/lib/situation';
import { supabase } from '@/integrations/supabase/client';
import { MediaDropBox } from './SituationAddForm';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';
import PedagogyFields from './PedagogyFields';
import { manualPedagogy } from '@/lib/curriculum';

function mediaDetails(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  const image = root.querySelector('img')?.getAttribute('src') || '';
  const audioNode = root.querySelector('[data-audio]');
  const audio = audioNode?.getAttribute('data-src') || root.querySelector('audio')?.getAttribute('src') || '';
  const audioName = audioNode?.getAttribute('data-filename') || 'Áudio da situação';
  return { image, audio, audioName };
}

function extension(file: File) {
  return file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (file.type.startsWith('image/') ? 'jpg' : 'mp3');
}

export default function SituationEditForm({ cardId, deckId, audioId, initial, onSaved }: { cardId: string; deckId: string; audioId: string|null; initial: SituationContent; onSaved: () => void }) {
  const [stage,setStage]=useState(initial.pedagogy?.stage||0),[hint,setHint]=useState(initial.context);
  const existing = mediaDetails(initial.mediaHtml);
  const [english,setEnglish]=useState(initial.english),[portuguese,setPortuguese]=useState(initial.portuguese);
  const [image,setImage]=useState<File|null>(null),[audio,setAudio]=useState<File|null>(null);
  const [imageUrl,setImageUrl]=useState(existing.image),[audioUrl,setAudioUrl]=useState(existing.audio),[audioName,setAudioName]=useState(existing.audioName);
  const [saving,setSaving]=useState(false);
  const imagePrompt = initial.pedagogy?.imagePrompt ? buildImageGenerationPrompt(initial) : '';
  const copyImagePrompt = async () => {
    try {
      await navigator.clipboard.writeText(imagePrompt);
      toast.success('Prompt copiado! Gere a imagem no formato quadrado (1:1).');
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie o prompt abaixo.');
    }
  };
  const ready=!!english.trim()&&!!portuguese.trim();
  const pickImage=(file:File)=>{if(image&&imageUrl)URL.revokeObjectURL(imageUrl);setImage(file);setImageUrl(URL.createObjectURL(file));};
  const pickAudio=(file:File)=>{if(audio&&audioUrl)URL.revokeObjectURL(audioUrl);setAudio(file);setAudioUrl(URL.createObjectURL(file));setAudioName(file.name);};
  const save=async()=>{
    if(!ready||saving)return;
    setSaving(true);
    const uploaded:string[]=[];
    try {
      if(!navigator.onLine)throw new Error('Conecte-se à internet para salvar esta situação.');
      const user=(await supabase.auth.getUser()).data.user;
      if(!user)throw new Error('Sua sessão expirou.');
      const upload=async(file:File)=>{const path=`${user.id}/situations/${deckId}/${crypto.randomUUID()}.${extension(file)}`;const {error}=await supabase.storage.from('card-media').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;uploaded.push(path);return supabase.storage.from('card-media').getPublicUrl(path).data.publicUrl;};
      const finalImage=image?await upload(image):imageUrl;
      const finalAudio=audio?await upload(audio):audioUrl;
      const media=`${finalImage?`<img src="${escapeHtml(finalImage)}" alt="Situação visual">`:''}${finalAudio?`<div data-audio="true" data-src="${escapeHtml(finalAudio)}" data-filename="${escapeHtml(audioName)}" class="audio-node"><audio src="${escapeHtml(finalAudio)}" class="audio-node-element"></audio></div>`:''}`;
      const pedagogy=stage===initial.pedagogy?.stage?initial.pedagogy:manualPedagogy(stage,initial.pedagogy);
      const html=buildSituationHtml({english:english.trim(),context:hint.trim(),portuguese:portuguese.trim(),mediaHtml:media,pedagogy,imagePrompt:initial.imagePrompt});
      await updateCard(cardId,{front:html.front,back:html.back,dictationAnswer:english.trim()});
      toast.success('Situação atualizada!');
      onSaved();
    } catch(error) {
      if(uploaded.length)void supabase.storage.from('card-media').remove(uploaded);
      toast.error(error instanceof Error?error.message:'Não foi possível salvar a situação.');
    } finally { setSaving(false); }
  };
  return <>
    <PedagogyFields stage={stage} onStage={setStage} hint={hint} onHint={setHint}/>
    {imagePrompt&&<section className="rounded-2xl border border-border bg-card p-4 space-y-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Prompt para gerar imagem</h2><Button type="button" variant="outline" size="sm" onClick={copyImagePrompt}><Copy className="mr-2 h-4 w-4"/>Copiar prompt</Button></div><p className="text-xs text-muted-foreground">Imagem quadrada (1:1), sem texto.</p><p className="whitespace-pre-wrap select-text break-words">{imagePrompt}</p></section>}
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4"><div className="flex gap-2"><Upload className="h-5 w-5 text-primary"/><div><h2 className="font-bold">1. Imagem e áudio</h2><p className="text-xs text-muted-foreground">Você pode manter os arquivos atuais ou substituí-los.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><MediaDropBox kind="image" file={image} preview={imageUrl} onFile={pickImage} onClear={()=>{if(image&&imageUrl)URL.revokeObjectURL(imageUrl);setImage(null);setImageUrl('');}}/><MediaDropBox kind="audio" file={audio} preview={audioUrl} fileName={audioName} onFile={pickAudio} onClear={()=>{if(audio&&audioUrl)URL.revokeObjectURL(audioUrl);setAudio(null);setAudioUrl('');}}/></div></section>
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4"><div className="flex gap-2"><MessageSquareText className="h-5 w-5 text-primary"/><h2 className="font-bold">2. Frases</h2></div><div><Label htmlFor="english">Frase em inglês</Label><Input id="english" lang="en" value={english} onChange={e=>setEnglish(e.target.value)}/><p className="mt-1 text-xs text-muted-foreground">Esta mesma frase será usada para corrigir o ditado.</p></div><div><Label htmlFor="portuguese">Frase em português</Label><Input id="portuguese" value={portuguese} onChange={e=>setPortuguese(e.target.value)}/><p className="mt-1 text-xs text-muted-foreground">Serve como apoio quando você precisar consultar o significado.</p></div></section>
    <Button type="button" onClick={save} className="w-full h-12" disabled={!ready||saving}>{saving?'Salvando…':'Salvar situação'}</Button>
    {!ready&&<p className="text-xs text-center text-muted-foreground">Complete a imagem, o áudio e as duas frases.</p>}
  </>;
}
