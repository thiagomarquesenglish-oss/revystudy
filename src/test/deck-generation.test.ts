import {beforeEach, expect, it, vi} from 'vitest';
import {deckGenerationPrompt, replacementPrompt, validateDeckGeneration, sceneRules, simpleEnglishRules} from '../../server/deck-generation.js';
import {deckRepertoire, generateDeckSituations, saveGeneratedSituations} from '@/lib/deck-generation';
import {buildSituationHtml, readSituation} from '@/lib/situation';
import type {Flashcard} from '@/lib/types';
const mocks = vi.hoisted(() => ({cards:vi.fn(), add:vi.fn(), session:vi.fn()}));
vi.mock('@/lib/storage', () => ({getCardsByDeck:mocks.cards, addCard:mocks.add}));
vi.mock('@/integrations/supabase/client', () => ({supabase:{auth:{getSession:mocks.session}}}));
const previous = ['I need a table.'];
it('uses the same short natural English rules for batches and replacements',()=>{
  expect(deckGenerationPrompt(previous)).toContain(simpleEnglishRules);
  expect(replacementPrompt(previous,'bridge',[])).toContain(simpleEnglishRules);
  expect(simpleEnglishRules).toContain('UMA única ideia');
});
it('accepts nine words but rejects ten in a replacement and a batch',()=>{
  const batch=items();
  batch[0].english='I need a new table by the window today.';
  expect(validateDeckGeneration({situations:batch},previous)).toHaveLength(20);
  batch[0].english='I need a new table by the window today please.';
  expect(()=>validateDeckGeneration({situations:batch},previous)).toThrow('9 palavras');
  expect(()=>validateDeckGeneration({situations:[batch[0]]},previous,{kind:'bridge'})).toThrow('9 palavras');
});
it('orders repertoire by creation date without mutating cards',()=>{
  const cards=[{...buildSituationHtml({english:'Old',portuguese:'Antigo',context:'',mediaHtml:''}),createdAt:'2020'},{...buildSituationHtml({english:'Recent',portuguese:'Recente',context:'',mediaHtml:''}),createdAt:'2025'}] as Flashcard[];
  expect(deckRepertoire(cards)).toEqual(['Recent','Old']);expect(cards[0].createdAt).toBe('2020');
});
it('validates a single replacement and rejects a previously seen suggestion',()=>{
  const item={kind:'bridge',english:'I need a receipt.',portuguese:'Preciso de recibo.',imagePrompt:'Homem pedindo um recibo ao caixa de uma loja.',sourceEnglish:previous[0],anchor:'I need',newVocabulary:''};
  expect(validateDeckGeneration({situations:[item]},previous,{kind:'bridge',excluded:[]})).toHaveLength(1);
  expect(()=>validateDeckGeneration({situations:[item]},previous,{kind:'bridge',excluded:[item.english]})).toThrow();
  expect(()=>validateDeckGeneration({situations:[item]},previous,{kind:'new',excluded:[]})).toThrow();
});
const items = () => Array.from({length:20}, (_,i) => ({kind:i<10?'bridge':'new', english:i<10?`I need item ${i}.`:`Please bring object${i}.`, portuguese:`Tradução ${i}.`, imagePrompt:'Mulher pedindo um objeto ao atendente de uma loja.', sourceEnglish:i<10?previous[0]:'', anchor:i<10?'I need':'', newVocabulary:i<10?'':`object${i}`}));
beforeEach(() => {vi.clearAllMocks(); vi.unstubAllGlobals(); mocks.cards.mockResolvedValue([]); mocks.session.mockResolvedValue({data:{session:{access_token:'test'}}}); mocks.add.mockResolvedValue({id:'new'});});
it('accepts exactly ten connected and ten novel situations', () => {
  expect(validateDeckGeneration({situations:items()},previous)).toHaveLength(20);
  expect(deckGenerationPrompt(previous)).toContain(JSON.stringify(previous));
  expect(sceneRules).toContain('Mulher segurando a conta');
  expect(sceneRules).toContain('ele/ela/eles');
});
it.each(['count','duplicate','existing','anchor','vocabulary','scene','balance'])('rejects invalid %s', kind => {
  const batch=items();
  if(kind==='count')batch.pop();
  if(kind==='duplicate')batch[1].english=batch[0].english;
  if(kind==='existing')batch[0].english=previous[0];
  if(kind==='anchor')batch[0].anchor='Can I';
  if(kind==='vocabulary'){batch[10].english='I need a table too.';batch[10].newVocabulary='table';}
  if(kind==='scene')batch[0].imagePrompt='Um grupo de amigos.';
  if(kind==='balance'){batch[9]={...batch[19],english:'Bring object29.',newVocabulary:'object29'};}
  expect(()=>validateDeckGeneration({situations:batch},previous)).toThrow();
});
it('starts an empty deck with twenty independent new situations', () => {
  const batch=items().map((item,i)=>({...item,kind:'new',english:`Bring object${i}.`,newVocabulary:`object${i}`,sourceEnglish:'',anchor:''}));
  expect(validateDeckGeneration({situations:batch},[])).toHaveLength(20);
});
it('extracts text only from situations, typing cards and concept examples', () => {
  const cards=[buildSituationHtml({english:'Hello!',portuguese:'Olá',context:'',mediaHtml:'<img src="data:large">'}),{front:'<p>Question</p>',back:'<p>• Try again. → Tente novamente.</p>',dictationAnswer:'Try it.'}] as Flashcard[];
  expect(deckRepertoire(cards)).toEqual(['Hello!','Try it.','Try again.']);
});
it('sends current deck content with every generation', async () => {
  mocks.cards.mockResolvedValue([{...buildSituationHtml({english:previous[0],portuguese:'Preciso',context:'',mediaHtml:''})}]);
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({situations:items()})});vi.stubGlobal('fetch',fetcher);
  await generateDeckSituations('d');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({mode:'deck-batch',previous});
  expect(mocks.add).not.toHaveBeenCalled();
});
it('saves full situation metadata and skips existing phrases on retry', async () => {
  const batch=items();
  mocks.cards.mockResolvedValue([{...buildSituationHtml({...batch[0],context:'',mediaHtml:''})}]);
  await saveGeneratedSituations('d',batch as any,vi.fn());
  expect(mocks.add).toHaveBeenCalledTimes(19);
  const args=mocks.add.mock.calls[0];
  expect(readSituation(args[1],args[2])?.imagePrompt).toBe(batch[1].imagePrompt);
  expect(args[5]).toBe(batch[1].english);
});
it('stops on a save error while retaining completed progress', async () => {
  mocks.add.mockResolvedValueOnce({id:'first'}).mockRejectedValueOnce(new Error('full'));
  const done=vi.fn();
  await expect(saveGeneratedSituations('d',items() as any,done)).rejects.toThrow('full');
  expect(done).toHaveBeenCalledTimes(1);
  expect(mocks.add).toHaveBeenCalledTimes(2);
});
