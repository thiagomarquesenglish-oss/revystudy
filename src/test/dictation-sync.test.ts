import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const cloud = vi.hoisted(() => ({ events: [] as any[], failure: false, cards: [{id:'card',deck_id:'deck'}] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({data:{session:{user:{id:'user'}}}}) },
  from: (table:string) => ({
    upsert: async (rows:any[]) => {
      if(cloud.failure) return {error:new Error('offline')};
      for(const row of rows) if(!cloud.events.some(e=>e.id===row.id))cloud.events.push(row);
      return {error:null};
    },
    select: () => table==='cards' ? {in:()=>({eq:async()=>({data:cloud.cards,error:null})})} : {eq:()=>({order:()=>({range:async()=>({data:cloud.events,error:null})})})}
  })
}}));
import { deriveDictationHistory, dictationSummary, type DictationReview } from '@/lib/dictation-events';
import { getDictationEvents, migrateLegacyDictation, pendingDictationCount, recordDictationReview, restoreDictationEvents, syncDictation } from '@/lib/dictation-sync';
import { readDictationHistory, saveDictationHistory } from '@/lib/dictation-srs';
const event=(id:string,rating:DictationReview['rating'],day:number):DictationReview=>({id,user_id:'user',card_id:'card',deck_id:'deck',answer:'Hello',rating,reviewed_at:`2026-09-0${day}T12:00:00.000Z`});
beforeEach(()=>{localStorage.clear();cloud.events=[];cloud.failure=false;cloud.cards=[{id:'card',deck_id:'deck'}];vi.spyOn(navigator,'onLine','get').mockReturnValue(false);});
afterEach(async()=>{await syncDictation().catch(()=>{});vi.restoreAllMocks();});
describe('dictation history integrity',()=>{
  it('combines out-of-order device reviews exactly once',()=>{
    const a=event('a','good',1), b=event('b','again',2);
    const merged=deriveDictationHistory([b,a,a],'deck');
    expect(merged.card.reviews).toBe(2);expect(merged.card.mistakes).toBe(1);expect(merged.card.interval).toBe(0);
  });
  it('keeps legacy scheduling and migrates only once',()=>{
    const legacy={answer:'Hello',interval:7,due:1800000000000,reviews:5,mistakes:2};
    saveDictationHistory('user','deck',{card:legacy});migrateLegacyDictation('user');migrateLegacyDictation('user');
    expect(getDictationEvents('user')).toHaveLength(1);expect(deriveDictationHistory(getDictationEvents('user'),'deck').card).toEqual(legacy);
    expect(dictationSummary(getDictationEvents('user')).accuracy).toBe(60);
  });
  it('keeps offline answers durable and retries cloud failures',async()=>{
    recordDictationReview('user','deck','card','Hello','good');await syncDictation();expect(pendingDictationCount('user')).toBe(1);
    vi.spyOn(navigator,'onLine','get').mockReturnValue(true);cloud.failure=true;
    await expect(syncDictation()).rejects.toThrow('offline');expect(pendingDictationCount('user')).toBe(1);
    cloud.failure=false;await syncDictation();await syncDictation();
    expect(pendingDictationCount('user')).toBe(0);expect(cloud.events).toHaveLength(1);expect(getDictationEvents('user')).toHaveLength(1);
  });
  it('pulls another device and preserves the local attempt',async()=>{
    recordDictationReview('user','deck','card','Hello','good');await syncDictation();cloud.events=[event('remote','hard',1)];
    vi.spyOn(navigator,'onLine','get').mockReturnValue(true);await syncDictation();
    expect(readDictationHistory('user','deck').card.reviews).toBe(2);
  });
  it('does not resurrect a deleted card from legacy storage',async()=>{
    saveDictationHistory('user','deck',{card:{answer:'Hello',interval:1,due:10,reviews:1,mistakes:0}});cloud.cards=[];
    vi.spyOn(navigator,'onLine','get').mockReturnValue(true);await syncDictation();await syncDictation();
    expect(pendingDictationCount('user')).toBe(0);expect(readDictationHistory('user','deck')).toEqual({});
  });
  it('merges a backup idempotently and replaces obsolete local history',()=>{
    restoreDictationEvents('user',[event('a','good',1)],false);restoreDictationEvents('user',[event('a','good',1)],false);
    expect(getDictationEvents('user')).toHaveLength(1);
    restoreDictationEvents('user',[event('b','easy',2)],true);expect(getDictationEvents('user').map(e=>e.id)).toEqual(['b']);
    expect(getDictationEvents('another-user')).toEqual([]);
  });
});
