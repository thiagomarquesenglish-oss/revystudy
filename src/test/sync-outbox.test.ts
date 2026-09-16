import { beforeEach, expect, it, vi } from 'vitest';

const state=vi.hoisted(()=>({queue:[] as any[]}));
vi.mock('@/lib/offline-db',()=>({
  offlineQueue:{
    getAll:vi.fn(async()=>[...state.queue]),
    remove:vi.fn(async(id:string)=>{state.queue=state.queue.filter(item=>item.id!==id)}),
    count:vi.fn(async()=>state.queue.length),
    add:vi.fn(),
  },
}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({
  upsert:async(payload:any)=>({error:Array.isArray(payload)||payload.id==='bad'?new Error('invalid row'):null}),
  update:()=>({eq:async()=>({error:null})}),
  delete:()=>({eq:async()=>({error:null})}),
})}}));

import { syncOfflineQueue } from '@/lib/sync';

beforeEach(()=>{
  state.queue=[
    {id:'q1',table:'cards',action:'insert',payload:{id:'bad'}},
    {id:'q2',table:'cards',action:'insert',payload:{id:'good'}},
  ];
  vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
});

it('does not let one invalid old mutation block newer cards from reaching the cloud',async()=>{
  await expect(syncOfflineQueue()).rejects.toThrow('invalid row');
  expect(state.queue.map(item=>item.payload.id)).toEqual(['bad']);
});
