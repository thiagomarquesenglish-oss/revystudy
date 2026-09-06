import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Image, Volume2, MessageSquareText, Languages, CheckCircle2 } from 'lucide-react';
import { addCard, getDeckAudios } from '@/lib/storage';
import { buildSituationHtml } from '@/lib/situation';
import RichTextEditor from './RichTextEditor';
import EditorToolbar from './EditorToolbar';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';

export default function SituationAddForm({ deckId }: { deckId: string }) {
  const [english,setEnglish]=useState(''), [context,setContext]=useState(''), [portuguese,setPortuguese]=useState(''), [media,setMedia]=useState('');
  const [audioId,setAudioId]=useState('none'), [audios,setAudios]=useState<{id:string;name:string}[]>([]), [saving,setSaving]=useState(false), [key,setKey]=useState(0);
  const [editor,setEditor]=useState<Editor|null>(null); const lock=useRef(false);
  useEffect(()=>{ void getDeckAudios(deckId).then(rows=>setAudios(rows.map(({id,name})=>({id,name})))); },[deckId]);
  const ready=english.trim() && media.includes('<img') && (media.includes('<audio') || audioId!=='none');
  const save=async(e:React.FormEvent)=>{e.preventDefault(); if(!ready||lock.current)return; lock.current=true;setSaving(true);
    try { const html=buildSituationHtml({english:english.trim(),context:context.trim(),portuguese:portuguese.trim(),mediaHtml:media});
      await addCard(deckId,html.front,html.back,audioId==='none'?null:audioId,'standard',english.trim());
      setEnglish('');setContext('');setPortuguese('');setMedia('');setAudioId('none');setKey(v=>v+1);
      toast.success('Situação criada!',{description:'Compreensão, produção e ditado foram configurados automaticamente.'});
    } catch { toast.error('Não foi possível criar a situação.'); } finally {lock.current=false;setSaving(false);}
  };
  const onReady=useCallback((value:Editor)=>setEditor(value),[]);
  return <form id="situation-form" onSubmit={save} className="space-y-5">
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3"><div className="flex gap-2"><Image className="h-5 w-5 text-primary"/><div><h2 className="font-bold">1. Imagem limpa e áudio</h2><p className="text-xs text-muted-foreground">Use uma imagem sem palavras. Adicione a imagem e o áudio abaixo.</p></div></div>
      <EditorToolbar editor={editor}/><RichTextEditor key={key} content="" onChange={setMedia} placeholder="A imagem da situação aparecerá aqui" onEditorReady={onReady}/>
      {audios.length>0&&<div><Label>Ou usar um áudio da biblioteca</Label><Select value={audioId} onValueChange={setAudioId}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Áudio inserido acima</SelectItem>{audios.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>}
    </section>
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4"><div className="flex gap-2"><MessageSquareText className="h-5 w-5 text-primary"/><h2 className="font-bold">2. Inglês principal</h2></div><div><Label htmlFor="english">Como você diria isso em inglês?</Label><Input id="english" lang="en" value={english} onChange={e=>setEnglish(e.target.value)} placeholder="The kitchen is over here."/></div><div><Label htmlFor="context">Contexto em inglês (opcional)</Label><Input id="context" lang="en" value={context} onChange={e=>setContext(e.target.value)} placeholder="You are showing a guest around your house."/></div></section>
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3"><div className="flex gap-2"><Languages className="h-5 w-5 text-primary"/><div><h2 className="font-bold">3. Apoio temporário</h2><p className="text-xs text-muted-foreground">O português some gradualmente conforme seus acertos.</p></div></div><Label htmlFor="portuguese">Tradução em português (opcional)</Label><Input id="portuguese" value={portuguese} onChange={e=>setPortuguese(e.target.value)} placeholder="A cozinha fica aqui."/></section>
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4"><h2 className="font-bold mb-3">Três exercícios automáticos</h2>{[['Compreensão','Áudio ou inglês → entender'],['Produção','Imagem + contexto → falar em inglês'],['Ditado','Áudio → escrever a frase']].map(([a,b])=><div key={a} className="flex gap-2 py-1.5 text-sm"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5"/><span><strong>{a}:</strong> {b}</span></div>)}</section>
    <Button className="w-full h-12" disabled={!ready||saving}>{saving?'Criando situação…':'Criar situação'}</Button>
    {!ready&&<p className="text-xs text-center text-muted-foreground">Para criar: adicione uma imagem, uma frase em inglês e um áudio.</p>}
  </form>;
}
