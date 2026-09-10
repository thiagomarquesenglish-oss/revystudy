import {useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'sonner';
import PageHeader from '@/components/PageHeader';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {loadLearningData} from '@/lib/learning-data';
import {curriculumProgress} from '@/lib/learning-progress';
import {exportGeneratorPackage,inspectAiBatch,batchCardHtml,MASTER_PROMPT} from '@/lib/ai-protocol';
import {importLearningCards} from '@/lib/storage';

export default function CurriculumContentPage(){
 const navigate=useNavigate();
 const [data,setData]=useState<Awaited<ReturnType<typeof loadLearningData>>|null>(null),[json,setJson]=useState(''),[preview,setPreview]=useState<ReturnType<typeof inspectAiBatch>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=async()=>{try{setData(await loadLearningData());setError('')}catch{setError('Não foi possível carregar o conteúdo.')}};
 useEffect(()=>{void refresh()},[]);
 const progress=useMemo(()=>data?curriculumProgress(data.cards,data.events,Date.now(),data.manualStage):null,[data]);
 const current=progress?.current;
 const prepared=current?.count||0,needed=current?Math.max(0,current.targetContent-prepared):0;
 const copy=async(text:string,message='Copiado!')=>{await navigator.clipboard.writeText(text);toast.success(message)};
 const inspect=()=>{if(!data)return;try{setPreview(inspectAiBatch(json,data.cards,data.events,data.manualStage));setError('')}catch(e){setPreview(null);setError(e instanceof Error?e.message:'Lote inválido.')}};
 const save=async()=>{if(!data||!preview||busy)return;const deckId=data.cards.find(card=>card.id&&card.deckId)?.deckId||data.decks[0]?.id;if(!deckId){setError('Crie um baralho antes de importar.');return}setBusy(true);try{await importLearningCards(deckId,preview.additions.map(item=>({...batchCardHtml(preview.batch,item),english:item.english})));toast.success(`${preview.additions.length} conteúdos importados.`);setJson('');setPreview(null);await refresh()}catch{setError('Não foi possível importar o lote.')}finally{setBusy(false)}};
 const preparation=<div className="mt-4 border-t border-border pt-4 space-y-4">
  <div><h2 className="font-semibold">Preparar conteúdo da Etapa {current?.stage}</h2><p className="text-sm text-muted-foreground mt-1">{prepared} de {current?.targetContent} preparados · faltam {needed}</p></div>
  <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>copy(MASTER_PROMPT,'Prompt Master copiado!')}>Copiar Prompt Master</Button><Button onClick={()=>data&&copy(exportGeneratorPackage(data.cards,data.events,data.manualStage),'Instruções e conteúdo da etapa copiados!')}>Copiar conteúdo para IA</Button></div>
  <Textarea aria-label="JSON da IA" rows={9} value={json} onChange={e=>{setJson(e.target.value);setPreview(null)}} placeholder="Cole aqui o REVYSTUDY_BATCH_V2"/>
  <Button variant="outline" disabled={!json.trim()} onClick={inspect}>Validar lote</Button>
  {preview&&<div className="space-y-3"><p>{preview.additions.length} novos conteúdos · {preview.duplicates} duplicados ignorados</p><div className="max-h-72 overflow-y-auto space-y-2">{preview.additions.map(item=><div key={item.id} className="rounded-lg border border-border p-3"><p lang="en">{item.english}</p><p className="text-sm text-muted-foreground">{item.portuguese}</p></div>)}</div><Button disabled={busy||!preview.additions.length} onClick={save}>{busy?'Importando…':'Aprovar e importar'}</Button></div>}
 </div>;
 return <div className="min-h-screen bg-background"><PageHeader title="Conteúdo do currículo" onBack={()=>navigate('/settings')}/><main className="max-w-3xl mx-auto px-4 pb-10 space-y-5" style={{paddingTop:'calc(var(--app-header-height) + 1.25rem)'}}>
  {!progress||!current?<p role="status">{error||'Carregando…'}</p>:<>
   <div className="space-y-3">{progress.units.map(stage=>{const active=stage.stage===current.stage;return <section key={stage.stage} className={`rounded-xl border p-4 ${active?'border-primary/40 bg-card':'border-border'}`}><div className="flex justify-between gap-4"><div><p className="font-medium">Etapa {stage.stage} — {stage.title}</p><p className="text-sm text-muted-foreground">{stage.count} / {stage.targetContent} conteúdos preparados</p></div><span className="text-sm">{stage.manuallyCompleted?'✅ Concluída':stage.count>=stage.targetContent?'✅ Pronta':stage.unlocked?'Disponível':'🔒'}</span></div>{active&&stage.unlocked&&needed>0&&preparation}{active&&stage.count>=stage.targetContent&&<div className="mt-4 border-t border-border pt-4 space-y-3"><p>✅ Conteúdo preparado. As ferramentas ficam ocultas até a próxima etapa ser liberada.</p>{stage.reviewCount===0&&<Button onClick={()=>navigate('/curriculum/study')}>Começar etapa</Button>}</div>}</section>})}</div>
  </>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </main></div>;
}
