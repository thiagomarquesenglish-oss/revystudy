import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import UnderstandHelp from '@/components/UnderstandHelp';
import {splitExplanation} from '@/lib/explanation-examples';
import {readSituation} from '@/lib/situation';
const mocks = vi.hoisted(()=>({add:vi.fn(), cards:vi.fn(), find:vi.fn(), more:vi.fn(), save:vi.fn()}));
vi.mock('@/lib/storage',()=>({addCard:mocks.add,getCardsByDeck:mocks.cards}));
vi.mock('@/lib/learning-help',()=>({findExplanations:mocks.find,requestMoreExamples:mocks.more,saveExplanation:mocks.save,markExplanationUsed:vi.fn(),requestExplanation:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),info:vi.fn()}}));
vi.mock('@/components/ui/drawer',()=>({Drawer:({children}:any)=><div>{children}</div>,DrawerContent:({children}:any)=><div>{children}</div>,DrawerHeader:({children}:any)=><div>{children}</div>,DrawerTitle:({children}:any)=><h2>{children}</h2>}));
const explanation={id:'e',selectedText:'Try',sentence:'Try again.',title:'Try',quickMeaning:'Tentar',conceptKey:'examples-v2:try',explanation:'Try = tentar.\n• Try again. → Tente novamente.\n👉 tried = passado.',cardFront:'Try',cardBack:'',useCount:1};
beforeEach(()=>{vi.clearAllMocks();mocks.cards.mockResolvedValue([]);mocks.add.mockResolvedValue({id:'new'});mocks.find.mockResolvedValue({exact:explanation,related:[]});mocks.save.mockImplementation(async value=>value);});
afterEach(cleanup);
async function open(){render(<UnderstandHelp sentence="Try again." portuguese="Tente novamente." deckId="deck" open/>);fireEvent.click(screen.getByRole('button',{name:'Try'}));fireEvent.click(screen.getByRole('button',{name:'Explicar “Try”'}));await screen.findByText('Exemplos para praticar');}
it('separates examples while retaining the usage note',()=>{const result=splitExplanation(explanation.explanation);expect(result.examples).toEqual([{english:'Try again.',portuguese:'Tente novamente.'}]);expect(result.body).toContain('👉 tried');expect(result.body).not.toContain('→');});
it('creates a normal situation card and disables duplicate submission',async()=>{await open();fireEvent.click(screen.getByRole('button',{name:'Adicionar como cartão'}));await screen.findByRole('button',{name:'Já está no baralho'});expect(mocks.add).toHaveBeenCalledTimes(1);const [deck,front,back]=mocks.add.mock.calls[0];expect(deck).toBe('deck');expect(readSituation(front,back)).toMatchObject({english:'Try again.',portuguese:'Tente novamente.'});});
it('appends and saves only new examples, keeping previous examples usable',async()=>{mocks.more.mockResolvedValue([{english:'Try again.',portuguese:'Tente novamente.'},{english:'Try this.',portuguese:'Experimente isto.'}]);await open();fireEvent.click(screen.getByRole('button',{name:'Gerar mais exemplos'}));await screen.findByText('Try this.');expect(screen.getByText('Try again.')).toBeTruthy();expect(mocks.save.mock.calls[0][0].explanation.match(/Try again\./g)).toHaveLength(1);expect(screen.getAllByRole('button',{name:'Adicionar como cartão'})).toHaveLength(2);});
it('keeps existing examples available after a generation failure',async()=>{mocks.more.mockRejectedValue(new Error('offline'));await open();fireEvent.click(screen.getByRole('button',{name:'Gerar mais exemplos'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Gerar mais exemplos'})).not.toBeDisabled());expect(screen.getByText('Try again.')).toBeTruthy();expect(mocks.save).not.toHaveBeenCalled();});
