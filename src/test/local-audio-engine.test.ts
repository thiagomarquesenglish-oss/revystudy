import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({resolve:vi.fn()}));
vi.mock('@/lib/offline-media',()=>({resolveOfflineMediaUrl:mocks.resolve}));
let ctx:any;
beforeEach(()=>{
  vi.resetModules();mocks.resolve.mockResolvedValue('blob:local');
  ctx={state:'suspended',destination:{},decodeAudioData:vi.fn().mockResolvedValue({duration:2}),resume:vi.fn(async()=>{ctx.state='running';}),createBufferSource:vi.fn(()=>({connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null}))};
  vi.stubGlobal('AudioContext',class {constructor(){return ctx;}});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}));
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('reads local bytes once and decodes ahead of playback',async()=>{
  const engine=await import('@/lib/local-audio-engine');
  const first=await engine.prepareDecodedAudio('https://cdn.test/a.mp3');
  expect(await engine.prepareDecodedAudio('https://cdn.test/a.mp3')).toBe(first);
  expect(fetch).toHaveBeenCalledWith('blob:local');expect(ctx.decodeAudioData).toHaveBeenCalledOnce();
  expect(ctx.resume).not.toHaveBeenCalled();expect(ctx.createBufferSource).not.toHaveBeenCalled();
});
it('resumes synchronously on tap and stops pending playback after navigation',async()=>{
  const engine=await import('@/lib/local-audio-engine');
  const buffer=await engine.prepareDecodedAudio('a');
  let resume!:()=>void;ctx.resume.mockImplementation(()=>new Promise<void>(r=>{resume=()=>{ctx.state='running';r();};}));
  const stop=engine.playDecodedAudio(buffer,vi.fn(),vi.fn(),vi.fn());
  expect(ctx.resume).toHaveBeenCalledOnce();stop();resume();await Promise.resolve();
  expect(ctx.createBufferSource).not.toHaveBeenCalled();
});
it('plays decoded audio without HTML media loading or additional fetching',async()=>{
  const engine=await import('@/lib/local-audio-engine');const buffer=await engine.prepareDecodedAudio('a');
  ctx.state='running';const started=vi.fn();const stop=engine.playDecodedAudio(buffer,started,vi.fn(),vi.fn());
  expect(started).toHaveBeenCalledOnce();const node=ctx.createBufferSource.mock.results[0].value;
  expect(node.start).toHaveBeenCalledOnce();expect(fetch).toHaveBeenCalledOnce();stop();expect(node.stop).toHaveBeenCalledOnce();
});
it('stops a stuck resume within three seconds without late playback',async()=>{
  const engine=await import('@/lib/local-audio-engine');const buffer=await engine.prepareDecodedAudio('a');vi.useFakeTimers();
  ctx.resume.mockReturnValue(new Promise(()=>{}));const fail=vi.fn();engine.playDecodedAudio(buffer,vi.fn(),vi.fn(),fail);
  vi.advanceTimersByTime(3000);expect(fail).toHaveBeenCalledOnce();expect(ctx.createBufferSource).not.toHaveBeenCalled();
});
it('reports decoding failure and allows another attempt',async()=>{
  const engine=await import('@/lib/local-audio-engine');ctx.decodeAudioData.mockRejectedValueOnce(new Error('codec'));
  await expect(engine.prepareDecodedAudio('bad')).rejects.toThrow('decodificado');
  await expect(engine.prepareDecodedAudio('bad')).resolves.toBeTruthy();
});
