import { beforeEach, expect, it, vi } from 'vitest';

const state=vi.hoisted(()=>({queue:[] as any[],deleted:[] as string[],cards:[] as any[],decks:[] as any[],tables:[] as string[]}));
vi.mock('@/lib/offline-db',()=>({
  localDB:{getCards:vi.fn(async()=>state.cards),getDecks:vi.fn(async()=>state.decks)},
  offlineQueue:{
    getAll:vi.fn(async()=>[...state.queue]),
    remove:vi.fn(async(id:string)=>{state.queue=state.queue.filter(item=>item.id!==id)}),
    count:vi.fn(async()=>state.queue.length),
    add:vi.fn(),
  },
}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>({
  upsert:async(payload:any)=>{state.tables.push(table);return {error:table==='cards'&&(Array.isArray(payload)||payload.id==='bad')?new Error('invalid row'):null}},
  update:()=>({eq:async()=>({error:null})}),
  delete:()=>({eq:async(_field:string,id:string)=>{state.deleted.push(id);return {error:null}}}),
})}}));

import { syncOfflineQueue } from '@/lib/sync';

beforeEach(()=>{
  state.queue=[
    {id:'q1',table:'cards',action:'insert',payload:{id:'bad'}},
    {id:'q2',table:'cards',action:'insert',payload:{id:'good'}},
  ];
  state.deleted=[];
  state.cards=state.queue.map(item=>item.payload);
  state.decks=[];
  state.tables=[];
  vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
});

it('uploads the parent deck before its current cards',async()=>{
  state.queue=[{id:'q1',table:'cards',action:'insert',payload:{id:'card',deck_id:'deck'}}];
  state.cards=[{id:'card',deck_id:'deck',front:'Current'}];
  state.decks=[{id:'deck',name:'English',user_id:'user'}];
  await syncOfflineQueue();
  expect(state.tables).toEqual(['decks','cards']);
  expect(state.queue).toEqual([]);
});

it('collapses obsolete work into the final state for each card',async()=>{
  state.queue=[
    {id:'q1',table:'cards',action:'insert',payload:{id:'old',front:'Old'}},
    {id:'q2',table:'cards',action:'update',payload:{id:'old',front:'Edited'}},
    {id:'q3',table:'cards',action:'delete',payload:{id:'old'}},
  ];
  state.cards=[];
  await syncOfflineQueue();
  expect(state.deleted).toEqual(['old']);
  expect(state.queue).toEqual([]);
});

it('does not let one invalid old mutation block newer cards from reaching the cloud',async()=>{
  await expect(syncOfflineQueue()).rejects.toThrow('invalid row');
  expect(state.queue.map(item=>item.payload.id)).toEqual(['bad']);
});

it('discards queued review history and schedule updates before syncing',async()=>{
  state.queue=[
    {id:'q1',table:'review_history',action:'insert',payload:{id:'review'}},
    {id:'q2',table:'cards',action:'update',payload:{id:'card',review_count:4,due_date:'tomorrow'}},
    {id:'q3',table:'cards',action:'update',payload:{id:'card',front:'New sentence'}},
  ];
  state.cards=[{id:'card',front:'New sentence'}];
  await syncOfflineQueue();
  expect(state.queue).toEqual([]);
});
