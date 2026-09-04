import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getReviewHistory } from '@/lib/storage';
import { getDictationEvents, syncDictation } from '@/lib/dictation-sync';
import { deriveDictationHistory, dictationSummary } from '@/lib/dictation-events';
export default function LearningSummary() {
  const { user } = useAuth();
  const [stats, setStats] = useState<{cards: number; accuracy: number | null; writing: number; due: number} | null>(null);
  const [error,setError] = useState(false);
  useEffect(() => {
    if (!user) return;
    let active=true;
    const load=async()=>{
      try {
        const history=await getReviewHistory();
        const events=getDictationEvents(user.id);
        const summary=dictationSummary(events);
        let due=0;
        for (const deck of new Set(events.map(e=>e.deck_id))) due+=Object.values(deriveDictationHistory(events,deck)).filter(p=>p.due<=Date.now()).length;
        if(active){setStats({cards:history.find(h=>h.date===new Date().toISOString().slice(0,10))?.count||0,accuracy:summary.accuracy,writing:summary.today,due});setError(false);}
      } catch {if(active)setError(true);}
    };
    void load(); void syncDictation().catch(()=>{});
    window.addEventListener('revystudy:dictation-updated',load);
    return ()=>{active=false;window.removeEventListener('revystudy:dictation-updated',load);};
  },[user?.id]);
  if(error)return <p role="status" className="text-sm text-muted-foreground">Não foi possível carregar o resumo agora.</p>;
  return <section className="space-y-4">
    <div className="grid grid-cols-3 gap-3">
      {[['Cartões hoje',stats?.cards],['Ditados hoje',stats?.writing],['Acertos no ditado',stats?.accuracy==null?'—':`${stats.accuracy}%`]].map(([label,value])=><div key={label} className="rounded-2xl bg-card p-4"><p className="text-2xl font-semibold tabular-nums">{value??'—'}</p><p className="text-xs text-muted-foreground mt-2">{label}</p></div>)}
    </div>
    <p className="text-sm text-muted-foreground">{stats ? `${stats.due} ${stats.due===1?'frase de escrita agendada':'frases de escrita agendadas'} para revisar agora.` : 'Carregando seu progresso…'}</p>
    <p className="text-xs text-muted-foreground">Cartões e ditado têm históricos separados. A taxa de acertos inclui as avaliações de escrita registradas; a prática extra não entra nessa conta.</p>
  </section>;
}
