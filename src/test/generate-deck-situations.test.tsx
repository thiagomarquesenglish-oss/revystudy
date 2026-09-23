import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import GenerateDeckSituations from '@/components/GenerateDeckSituations';
const mocks=vi.hoisted(()=>({generate:vi.fn(),save:vi.fn()}));
vi.mock('@/lib/deck-generation',()=>({generateDeckSituations:mocks.generate,saveGeneratedSituations:mocks.save}));
vi.mock('@/components/ui/drawer',()=>({Drawer:({open,children}:any)=>open?<div>{children}</div>:null,DrawerContent:({children}:any)=><div>{children}</div>,DrawerHeader:({children}:any)=><div>{children}</div>,DrawerTitle:({children}:any)=><h2>{children}</h2>}));
const items=Array.from({length:20},(_,i)=>({kind:i<10?'bridge':'new',english:`Sentence ${i}`,portuguese:`Frase ${i}`,imagePrompt:'Mulher falando com um amigo na rua.',anchor:'Can I',sourceEnglish:'Can I help?',newVocabulary:'help'}));
beforeEach(()=>{vi.clearAllMocks();mocks.generate.mockResolvedValue(items);mocks.save.mockImplementation(async(_deck,items,done)=>items.forEach(item=>done(item.english)));});
afterEach(cleanup);
it('previews twenty before saving, then allows the next batch',async()=>{
  const changed=vi.fn();render(<GenerateDeckSituations deckId="deck" onSaved={changed}/>);
  fireEvent.click(screen.getByRole('button',{name:'Gerar 20 situações'}));
  fireEvent.click(screen.getByRole('button',{name:'Gerar agora'}));
  await screen.findByText('Sentence 19');
  expect(mocks.generate).toHaveBeenCalledWith('deck');expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getAllByText('Gancho: Can I')).toHaveLength(10);
  fireEvent.click(screen.getByRole('button',{name:'Adicionar situações ao baralho'}));
  await screen.findByRole('button',{name:'Gerar mais 20 situações'});
  expect(screen.getAllByText('Adicionado')).toHaveLength(20);expect(changed).toHaveBeenCalledOnce();
});
it('shows generation failures without creating cards',async()=>{
  mocks.generate.mockRejectedValue(new Error('Limite atingido'));
  render(<GenerateDeckSituations deckId="deck" onSaved={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Gerar 20 situações'}));fireEvent.click(screen.getByRole('button',{name:'Gerar agora'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Limite atingido');expect(mocks.save).not.toHaveBeenCalled();
});
it('keeps the preview available after partial saving fails',async()=>{
  mocks.save.mockImplementation(async(_deck,items,done)=>{done(items[0].english);throw new Error('fail');});
  render(<GenerateDeckSituations deckId="deck" onSaved={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Gerar 20 situações'}));fireEvent.click(screen.getByRole('button',{name:'Gerar agora'}));
  fireEvent.click(await screen.findByRole('button',{name:'Adicionar situações ao baralho'}));
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('não serão duplicados'));
  expect(screen.getByText('Sentence 19')).toBeInTheDocument();expect(screen.getByText('Adicionado')).toBeInTheDocument();
});
