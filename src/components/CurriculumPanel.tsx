import { useEffect,useMemo,useState } from 'react';
import { loadLearningData } from '@/lib/learning-data';
import { curriculumProgress,SKILLS,SKILL_LABELS,type EvidenceStatus } from '@/lib/learning-progress';
import { Progress } from '@/components/ui/progress';

const evidenceText:Record<EvidenceStatus,string>={none:'Ainda não avaliada',low:'Pouca evidência',sufficient:'Evidência suficiente'};

export default function CurriculumPanel(){
  const [data,setData]=useState<Awaited<ReturnType<typeof loadLearningData>>|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{void loadLearningData().then(setData).catch(()=>setError('Não foi possível carregar o progresso.'));},[]);
  const progress=useMemo(()=>data?curriculumProgress(data.cards,data.events,Date.now(),data.manualStage):null,[data]);
  if(!progress)return <section className="rounded-2xl border border-border bg-card p-5"><p role="status">{error||'Carregando seu progresso…'}</p></section>;
  const current=progress.current;
  const sufficient=SKILLS.filter(skill=>current.evidence[skill]==='sufficient').length;
  const needs=SKILLS.filter(skill=>current.evidence[skill]!=='sufficient'||(current.skills[skill]??0)<65).map(skill=>SKILL_LABELS[skill]);
  return <section className="space-y-5" aria-label="Progresso do currículo">
    <div><p className="text-sm text-muted-foreground">Etapa {current.stage} de {progress.units.length}</p><h2 className="text-2xl font-bold mt-1">{current.title}</h2><p className="text-sm text-muted-foreground mt-1">{current.goal}</p></div>
    <div className="rounded-2xl border border-primary/30 bg-card p-5 space-y-5">
      <div><div className="flex justify-between mb-2"><span>Progresso observado</span><strong>{current.overall}%</strong></div><Progress value={current.overall}/><p className="text-xs text-muted-foreground mt-2">Cobertura: {sufficient} de 4 habilidades com evidência suficiente</p></div>
      <div className="space-y-4">{SKILLS.map(skill=>{const value=current.skills[skill],status=current.evidence[skill];return <div key={skill}><div className="flex justify-between gap-3 text-sm mb-2"><span>{SKILL_LABELS[skill]}</span><span className={status==='sufficient'?'':'text-muted-foreground'}>{value===null?'—':`${value}%`} · {evidenceText[status]}</span></div><Progress value={value??0} className="h-1.5"/></div>})}</div>
      {!current.earned&&<div className="rounded-xl bg-secondary p-4"><p className="font-medium">Para avançar</p><p className="text-sm text-muted-foreground mt-1">{needs.length?`Obtenha evidência suficiente e melhore: ${needs.join(', ')}.`:'Continue praticando em dias diferentes para consolidar a retenção.'}</p></div>}
    </div>
    <div><h3 className="font-semibold mb-3">Seu caminho</h3><ol className="space-y-2">{progress.units.map(stage=><li key={stage.stage} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"><span className="text-sm">{stage.stage}. {stage.title}</span><span className="text-xs text-muted-foreground">{!stage.unlocked?'🔒':stage.mastered?'Dominada':stage.earned?'Concluída':stage.stage===current.stage?'Em andamento':'Liberada'}</span></li>)}</ol></div>
    <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer font-medium">Como funciona?</summary><p className="text-sm text-muted-foreground mt-3">Para avançar automaticamente, obtenha ao menos 80% de progresso observado, 65% em cada habilidade, evidência suficiente nas quatro habilidades e pratique o conteúdo em dias diferentes.</p></details>
  </section>;
}
