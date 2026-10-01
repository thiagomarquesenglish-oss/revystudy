import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
type Theme = {title:string;goal:string;userRole:string;assistantRole:string};
type Message = {role:'user'|'assistant';text:string;tip?:string};
export default function ConversationPage() {
  const {deckId}=useParams(); const navigate=useNavigate();
  const [themes,setThemes]=useState<Theme[]>([]),[topic,setTopic]=useState<Theme|null>(null);
  const [history,setHistory]=useState<Message[]>([]),[typed,setTyped]=useState(''),[hint,setHint]=useState(''),[showHint,setShowHint]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[finished,setFinished]=useState(false),[feedback,setFeedback]=useState('');
  const lock=useRef(false);
  const call=async(action:string,chosen?:Theme,messages:Message[]=[]) => {
    if(lock.current)return; lock.current=true;setBusy(true);setError('');
    try {
      const {data:{session}}=await supabase.auth.getSession(); if(!session)throw new Error('Sua sessão expirou.');
      const response=await fetch('/api/conversation',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({deckId,action,topic:chosen?`${chosen.title}: ${chosen.goal}. Aluno: ${chosen.userRole}. Interlocutor: ${chosen.assistantRole}.`:'',history:messages})});
      const result=await response.json(); if(!response.ok)throw new Error(result.error || 'Não foi possível continuar.');
      if(action==='themes')setThemes(result.themes);
      else {setTopic(chosen!);setHistory([...messages,{role:'assistant',text:result.reply,tip:result.tip}]);setHint(result.hint);setShowHint(false);setFinished(result.finished);setFeedback(result.feedback);setTyped('');}
    }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível continuar.');}
    finally{lock.current=false;setBusy(false);}
  };
  return <div className="min-h-screen bg-background safe-page"><PageHeader title="Treinar conversa" onBack={()=>navigate(`/deck/${deckId}`)}/>
    <main className="max-w-lg mx-auto px-4 pb-28 space-y-4" style={{paddingTop:'calc(var(--app-header-height, 48px) + 1rem)'}}>
      {error&&<p role="alert" className="text-destructive text-sm">{error}</p>}
      {!topic ? <><p className="text-sm text-muted-foreground">Temas baseados nas frases deste baralho. Nesta experiência, responda por texto ou use o ditado do teclado do iPhone.</p><Button className="w-full" disabled={busy} onClick={()=>void call('themes')}>{busy?'Preparando…':themes.length?'Sugerir outros temas':'Sugerir temas do baralho'}</Button>{themes.map(item=><button key={item.title} disabled={busy} onClick={()=>void call('turn',item)} className="w-full rounded-2xl bg-card p-5 text-left disabled:opacity-50"><span className="block font-semibold">{item.title}</span><span className="block text-sm text-muted-foreground">{item.goal}</span></button>)}</> : <>
        <div><h2 className="font-semibold">{topic.title}</h2><p className="text-sm text-muted-foreground">{topic.goal}</p><p className="text-xs text-muted-foreground mt-2">Você: {topic.userRole} · Interlocutor: {topic.assistantRole}</p></div>
        {history.map((item,index)=><div key={index} className="space-y-3">
          {item.tip&&<aside className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"><p className="font-medium mb-1">Dica para sua resposta</p><p className="whitespace-pre-line">{item.tip}</p></aside>}
          <div className={`rounded-2xl p-4 ${item.role==='user'?'bg-primary/15 ml-8':'bg-card mr-8'}`}><p className="text-xs text-muted-foreground mb-1">{item.role==='user'?'Você':topic.assistantRole}</p><p lang="en">{item.text}</p></div>
        </div>)}
        {finished ? <section className="rounded-2xl bg-card p-5 space-y-3"><h3 className="font-semibold">Conversa concluída</h3><p className="whitespace-pre-line">{feedback || 'Você concluiu este treino. Pode experimentar outra situação.'}</p><Button onClick={()=>{setTopic(null);setHistory([]);setFinished(false);setFeedback('');}}>Escolher outro tema</Button></section> : <>
          <Button variant="outline" disabled={busy} onClick={()=>setShowHint(value=>!value)}> {showHint?'Ocultar pista':'Preciso de uma pista'}</Button>{showHint&&<p lang="en" className="rounded-xl bg-secondary p-3">{hint}</p>}
          <form className="space-y-3" onSubmit={event=>{event.preventDefault();if(typed.trim())void call('turn',topic,[...history,{role:'user',text:typed.trim()}]);}}><label htmlFor="conversation-answer" className="text-sm">Sua resposta em inglês</label><textarea id="conversation-answer" lang="en" spellCheck={false} value={typed} maxLength={500} disabled={busy} onChange={event=>setTyped(event.target.value)} rows={2} className="w-full rounded-xl bg-card border border-border p-3 text-base resize-none"/><Button className="w-full" type="submit" disabled={busy||!typed.trim()}>{busy?'Preparando resposta…':'Enviar resposta'}</Button></form>
          <Button variant="ghost" disabled={busy} onClick={()=>{setTopic(null);setHistory([]);setTyped('');}}>Encerrar treino</Button>
        </>}
      </>}
    </main>
  </div>;
}
