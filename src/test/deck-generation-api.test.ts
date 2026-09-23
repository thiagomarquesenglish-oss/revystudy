import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import handler from '../../api/explain.js';
const mocks=vi.hoisted(()=>({user:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:mocks.user}})}));
const batch=Array.from({length:20},(_,i)=>({kind:i<10?'bridge':'new',english:i<10?`I need item ${i}.`:`Bring object${i}.`,portuguese:`Tradução ${i}`,imagePrompt:'Homem conversando com o atendente de uma loja.',sourceEnglish:i<10?'I need a table.':'',anchor:i<10?'I need':'',newVocabulary:i<10?'':`object${i}`}));
const response=()=>{const res={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res;};
beforeEach(()=>{vi.stubEnv('SUPABASE_URL','https://example.supabase.co');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test');vi.stubEnv('GEMINI_API_KEY','test');mocks.user.mockResolvedValue({data:{user:{id:'u'}},error:null});});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
it('authenticates and returns validated 10+10 without a selected explanation word',async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({situations:batch})}]}}]})});vi.stubGlobal('fetch',fetcher);
  const res=response();await handler({method:'POST',headers:{authorization:'Bearer test'},body:{mode:'deck-batch',previous:['I need a table.']}},res);
  expect(res.status).toHaveBeenCalledWith(200);expect(res.json.mock.calls[0][0].situations).toHaveLength(20);
  const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body.generationConfig.maxOutputTokens).toBe(8500);expect(body.contents[0].parts[0].text).toContain('I need a table.');
});
it('rejects unauthenticated requests before calling Gemini',async()=>{
  mocks.user.mockResolvedValue({data:{user:null},error:new Error('expired')});const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const res=response();await handler({method:'POST',headers:{},body:{mode:'deck-batch',previous:[]}},res);
  expect(res.status).toHaveBeenCalledWith(401);expect(fetcher).not.toHaveBeenCalled();
});
it('does not silently truncate an oversized deck',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const res=response();
  await handler({method:'POST',headers:{},body:{mode:'deck-batch',previous:Array(2001).fill('Hello')}},res);
  expect(res.status).toHaveBeenCalledWith(400);expect(fetcher).not.toHaveBeenCalled();
});
it('rejects malformed AI output instead of returning partial cards',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"situations":[]}'}]}}]})}));
  const res=response();await handler({method:'POST',headers:{},body:{mode:'deck-batch',previous:[]}},res);
  expect(res.status).toHaveBeenCalledWith(500);expect(res.json.mock.calls[0][0]).toHaveProperty('error');
});
