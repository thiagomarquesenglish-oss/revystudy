import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import StudyCard from '@/components/StudyCard';
import {buildSituationHtml} from '@/lib/situation';
import type {Flashcard} from '@/lib/types';
vi.mock('@/lib/storage',()=>({getCardReviewRows:vi.fn().mockResolvedValue([])}));
vi.mock('@/lib/card-display-preferences',()=>({useBlurPortuguese:()=>false}));
vi.mock('@/components/CardOptions',()=>({default:()=>null}));
vi.mock('@/components/WritingErrorExplanation',()=>({default:()=>null}));
const card={id:'writing',deckId:'deck',audioId:null,cardType:'standard',...buildSituationHtml({english:'Try again.',portuguese:'Tente novamente.',context:'',mediaHtml:''})} as Flashcard;
afterEach(cleanup);
it('lets the learner rate correct writing Easy instead of forcing Good',()=>{
  const rate=vi.fn();
  render(<StudyCard card={card} forcedMode="audio-dictation" onRate={rate} remainingNew={0} remainingLearning={0} remainingReview={0}/>);
  fireEvent.change(screen.getByPlaceholderText('Escreva em inglês...'),{target:{value:'Try again.'}});
  fireEvent.click(screen.getByRole('button',{name:'Verificar'}));
  fireEvent.click(screen.getByRole('button',{name:'Fácil'}));
  expect(rate).toHaveBeenCalledWith('easy','audio-dictation');
});
