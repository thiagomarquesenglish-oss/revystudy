import {useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'sonner';
import PageHeader from '@/components/PageHeader';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {loadLearningData,saveManualCurriculumStage} from '@/lib/learning-data';
import {curriculumProgress} from '@/lib/learning-progress';
import {exportLearningContext,inspectAiBatch,batchCardHtml,MASTER_PROMPT} from '@/lib/ai-protocol';
import {importLearningCards} from '@/lib/storage';

export default function CurriculumContentPage(){
 const navigate=useNavigate();
 const [data,setData]=useState<Awaited<ReturnType<typeof loadLearningData>>|null>(null),[json,setJson]=useState(''),[preview,setPreview]=useState<ReturnType<typeof inspectAiBatch>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=async()=>{try{setData(await loadLearningData());setError('')}catch{setError('Não foi possível carregar o conteúdo.')}};
 useEffect(()=>{void refresh()},[]);
 const progress=useMemo(()=>data?curriculumProgress(data.cards,data.events,Date.now(),data.manualStage):null,[data]);
 const current=progress?.current;
 const prepared=current?.count||0,needed=current?Math.max(0,current.targetContent-prepared):0;
 const copy=async(text:string)=>{await navigator.clipboard.writeText(text);toast.success('Copiado!')};
 const inspect=()=>{if(!data)return;try{setPreview(inspectAiBatch(json,data.cards,data.events,data.manualStage));setError('')}catch(e){setPreview(null);setError(e instanceof Error?e.message:'Lote inválido.')}};
 const save=async()=>{if(!data||!preview||busy)return;const deckId=data.cards.find(card=>card.id&&card.deckId)?.deckId||data.decks[0]?.id;if(!deckId){setError('Crie um baralho antes de importar.');return}setBusy(true);try{await importLearningCards(deckId,preview.additions.map(item=>({...batchCardHtml(preview.batch,item),english:item.english})));toast.success(`${preview.additions.length} conteúdos importados.`);setJson('');setPreview(null);await refresh()}catch{setError('Não foi possível importar o lote.')}finally{setBusy(false)}};
 return <div className="min-h-screen bg-background"><PageHeader title="Conteúdo do currículo" onBack={()=>navigate('/settings')}/><main className="max-w-3xl mx-auto px-4 pb-10 space-y-5" style={{paddingTop:'calc(var(--app-header-height) + 1.25rem)'}}>
  {!progress||!current?<p role="status">{error||'Carregando…'}</p>:<>
   <div className="space-y-3">{progress.units.map(stage=><div key={stage.stage} className="flex justify-between gap-4 rounded-xl border border-border p-4"><div><p className="font-medium">Etapa {stage.stage} — {stage.title}</p><p className="text-sm text-muted-foreground">{stage.count} / {stage.targetContent} conteúdos preparados</p></div><span className="text-sm">{stage.count>=stage.targetContent?'✅ Pronta':stage.unlocked?'Disponível':'🔒'}</span></div>)}</div>
   {current.unlocked&&needed>0&&<section className="rounded-2xl border border-primary/30 bg-card p-5 space-y-4"><div><h2 className="font-semibold">Preparar conteúdo da Etapa {current.stage}</h2><p className="text-sm text-muted-foreground mt-1">{prepared} de {current.targetContent} preparados · faltam {needed}</p></div><Button onClick={()=>copy(exportLearningContext(data.cards,data.events))}>Copiar pedido para IA</Button><Textarea aria-label="JSON da IA" rows={9} value={json} onChange={e=>{setJson(e.target.value);setPreview(null)}} placeholder="Cole aqui o REVYSTUDY_BATCH_V2"/><Button variant="outline" disabled={!json.trim()} onClick={inspect}>Validar lote</Button>{preview&&<div className="space-y-3"><p>{preview.additions.length} novos conteúdos · {preview.duplicates} duplicados ignorados</p><div className="max-h-72 overflow-y-auto space-y-2">{preview.additions.map(item=><div key={item.id} className="rounded-lg border border-border p-3"><p lang="en">{item.english}</p><p className="text-sm text-muted-foreground">{item.portuguese}</p></div>)}</div><Button disabled={busy||!preview.additions.length} onClick={save}>{busy?'Importando…':'Aprovar e importar'}</Button></div>}</section>}
   {current.count>=current.targetContent&&<div className="rounded-xl bg-card p-4 space-y-3"><p>✅ Conteúdo preparado. As ferramentas de geração ficam ocultas enquanto você estuda.</p>{current.reviewCount===0&&<Button onClick={()=>navigate('/curriculum/study')}>Começar etapa</Button>}</div>}
   <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer font-medium">Configuração avançada</summary><div className="pt-4 space-y-3"><Button variant="outline" onClick={()=>copy(MASTER_PROMPT)}>Copiar Prompt Master</Button>{current.stage<30&&<Button variant="ghost" disabled={busy} onClick={async()=>{setBusy(true);try{await saveManualCurriculumStage(current.stage+1);await refresh();toast.success(`Etapa ${current.stage+1} liberada`)}finally{setBusy(false)}}}>Pular para a próxima etapa</Button>}</div></details>
  </>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </main></div>;
}
