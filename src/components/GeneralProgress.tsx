import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, BookOpen, CalendarDays, CheckCircle2 } from 'lucide-react';
import { loadLearningData } from '@/lib/learning-data';
import { modeSkills, SKILLS, SKILL_LABELS, type LearningEvent } from '@/lib/learning-progress';
import type { Flashcard } from '@/lib/types';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import Heatmap from '@/components/Heatmap';
import { useTabVisible } from '@/hooks/useTabVisible';

const ratingScore={again:0,hard:40,good:85,easy:100} as const;

export default function GeneralProgress(){
  const [cards,setCards]=useState<Flashcard[]>([]);
  const [events,setEvents]=useState<LearningEvent[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const load=useCallback(async()=>{try{setError(false);const data=await loadLearningData();setCards(data.cards);setEvents(data.events);}catch{setError(true);}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener('revystudy:learning-updated', refresh);
    return () => window.removeEventListener('revystudy:learning-updated', refresh);
  }, [load]);
  useTabVisible('/stats',load);

  const summary=useMemo(()=>{
    const uniqueEvents=[...new Map(events.map(event=>[event.id,event])).values()];
    const reviewedCards=new Set(uniqueEvents.map(event=>event.cardId)).size;
    const days=new Set(uniqueEvents.map(event=>event.at.slice(0,10))).size;
    const skills=Object.fromEntries(SKILLS.map(skill=>{
      const relevant=uniqueEvents.filter(event=>modeSkills(event.mode).includes(skill)).slice(-100);
      const value=relevant.length?Math.round(relevant.reduce((sum,event)=>sum+ratingScore[event.rating],0)/relevant.length):null;
      return [skill,{value,attempts:relevant.length}];
    })) as Record<(typeof SKILLS)[number],{value:number|null;attempts:number}>;
    return {reviews:uniqueEvents.length,reviewedCards,days,skills};
  },[events]);

  if(loading)return <p className="text-muted-foreground">Carregando suas estatísticas…</p>;
  if(error)return <div className="space-y-3"><p>Não foi possível carregar seu progresso agora.</p><Button onClick={()=>void load()}>Tentar novamente</Button></div>;

  return <div className="space-y-7">
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        [BookOpen,'Situações',cards.length],
        [CheckCircle2,'Já estudadas',summary.reviewedCards],
        [BarChart3,'Respostas',summary.reviews],
        [CalendarDays,'Dias de estudo',summary.days],
      ].map(([Icon,label,value])=><div key={String(label)} className="rounded-2xl bg-card p-4"><Icon className="h-5 w-5 text-primary"/><p className="text-2xl font-semibold mt-3 tabular-nums">{String(value)}</p><p className="text-xs text-muted-foreground mt-1">{String(label)}</p></div>)}
    </section>

    <section className="rounded-2xl bg-card p-5 space-y-5">
      <div><h2 className="font-semibold">Desempenho por habilidade</h2><p className="text-sm text-muted-foreground mt-1">Estas porcentagens orientam a mistura dos exercícios, mas não bloqueiam nenhum conteúdo.</p></div>
      <div className="space-y-4">{SKILLS.map(skill=>{const item=summary.skills[skill];return <div key={skill}><div className="flex justify-between gap-3 text-sm mb-2"><span>{SKILL_LABELS[skill]}</span><span className="text-muted-foreground">{item.value===null?'Ainda não praticada':`${item.value}% · ${item.attempts} respostas`}</span></div><Progress value={item.value??0} className="h-1.5"/></div>})}</div>
    </section>

    <section className="rounded-2xl bg-card p-5 space-y-4"><h2 className="font-semibold">Atividade</h2><Heatmap/></section>
  </div>;
}
