import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import QuickCardMedia from '@/components/QuickCardMedia';
import type {Flashcard} from '@/lib/types';
const mocks=vi.hoisted(()=>({get:vi.fn(),update:vi.fn(),upload:vi.fn(),remove:vi.fn()}));
vi.mock('@/lib/storage',()=>({getCardById:mocks.get,updateCard:mocks.update}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getUser:async()=>({data:{user:{id:'u'}}})},storage:{from:()=>({upload:mocks.upload,remove:mocks.remove,getPublicUrl:(path:string)=>({data:{publicUrl:'https://cdn.test/'+path}})})}}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),info:vi.fn()}}));
const card={id:'c',deckId:'d',front:'<p>Question</p>',back:'<p>Answer</p>',audioId:null} as Flashcard;
beforeEach(()=>{vi.clearAllMocks();mocks.get.mockResolvedValue(card);mocks.upload.mockResolvedValue({error:null});mocks.update.mockResolvedValue(undefined);mocks.remove.mockResolvedValue({error:null});});
afterEach(cleanup);
const image=new File(['img'],'image.png',{type:'image/png'}),audio=new File(['audio'],'audio.mp3',{type:'audio/mpeg'});
it('accepts image and audio together on a plain card without replacing text',async()=>{
  const saved=vi.fn();render(<QuickCardMedia card={card} onSaved={saved}><p>Card</p></QuickCardMedia>);
  fireEvent.drop(screen.getByText('Card'),{dataTransfer:{files:[image,audio]}});
  await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
  const patch=mocks.update.mock.calls[0][1];expect(patch.front).toContain('<p>Question</p>');expect(patch.front).toContain('<img');expect(patch.back).toContain('<p>Answer</p>');expect(patch.back).toContain('<audio');
  expect(screen.getByRole('button',{name:'Ouvir áudio'})).toBeTruthy();
});
it('loads original embedded media before adding audio',async()=>{
  mocks.get.mockResolvedValue({...card,front:'<p>Question</p><img src="data:image/png;base64,AAAA">'});
  render(<QuickCardMedia card={{...card,front:'<img src="" data-embedded-media="true">'}} onSaved={()=>{}}><p>Card</p></QuickCardMedia>);
  fireEvent.drop(screen.getByText('Card'),{dataTransfer:{files:[image,audio]}});
  await waitFor(()=>expect(mocks.update).toHaveBeenCalledOnce());
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(mocks.update.mock.calls[0][1].front).toContain('base64,AAAA');
});
it('keeps card unchanged when a second upload fails and cleans the first upload',async()=>{
  mocks.upload.mockResolvedValueOnce({error:null}).mockResolvedValueOnce({error:new Error('failed')});
  render(<QuickCardMedia card={card} onSaved={()=>{}}><p>Card</p></QuickCardMedia>);
  fireEvent.drop(screen.getByText('Card'),{dataTransfer:{files:[image,audio]}});
  await waitFor(()=>expect(mocks.remove).toHaveBeenCalledOnce());expect(mocks.update).not.toHaveBeenCalled();
});
