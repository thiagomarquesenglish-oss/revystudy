import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({prepare:vi.fn(),play:vi.fn(),running:vi.fn(),stop:vi.fn()}));
vi.mock('@/lib/local-audio-engine',()=>({prepareDecodedAudio:mocks.prepare,playDecodedAudio:mocks.play,audioIsRunning:mocks.running}));
import DecodedAudioPlayer from '@/components/DecodedAudioPlayer';
beforeEach(()=>{vi.clearAllMocks();mocks.prepare.mockResolvedValue({duration:1});mocks.running.mockReturnValue(false);mocks.play.mockImplementation((_buffer,start)=>{start();return mocks.stop;});});
afterEach(cleanup);
it('does not queue autoplay when locked; starts on manual tap after decoding',async()=>{
  render(<DecodedAudioPlayer src="a" autoPlay/>);await act(async()=>{});
  expect(mocks.play).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Reproduzir áudio'}));
  expect(mocks.play).toHaveBeenCalledOnce();expect(screen.getByRole('button',{name:'Pausar áudio'})).toBeInTheDocument();
  expect(document.querySelector('audio')).toBeNull();
});
it('stops playback on unmount and respects disabled autoplay',async()=>{
  mocks.running.mockReturnValue(true);const view=render(<DecodedAudioPlayer src="a" autoPlay={false}/>);await act(async()=>{});
  expect(mocks.play).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Reproduzir áudio'}));view.unmount();expect(mocks.stop).toHaveBeenCalled();
});
it('does not play a late preparation after unmount',async()=>{
  let finish!:(value:any)=>void;mocks.prepare.mockReturnValue(new Promise(r=>{finish=r;}));mocks.running.mockReturnValue(true);
  const view=render(<DecodedAudioPlayer src="a" autoPlay/>);view.unmount();await act(async()=>{finish({duration:1});});expect(mocks.play).not.toHaveBeenCalled();
});
