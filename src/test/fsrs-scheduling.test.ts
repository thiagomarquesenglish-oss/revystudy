import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { answerSchedule, availableAt, cardModes, loadScheduledCards, migrateSchedule, nextStudyDay, pickDueCard, type ScheduledCard } from '@/lib/fsrs-scheduling';
import { localDB } from '@/lib/offline-db';
import { buildSituationHtml } from '@/lib/situation';
import type { Flashcard } from '@/lib/types';

const now = new Date('2026-09-21T15:00:00Z');
const card: Flashcard = { id:'a', deckId:'d', ...buildSituationHtml({english:'Try again.',portuguese:'Tente novamente.',context:'',mediaHtml:'<img src="x"><audio src="a.mp3"></audio>'}), audioId:null, status:'new',interval:0,easeFactor:2.5,stepsIndex:0,repetition:0,reviewCount:0,lapseCount:0,dueDate:now.toISOString(),createdAt:now.toISOString(),updatedAt:now.toISOString(),progressUpdatedAt:now.toISOString(),flagged:false,cardType:'standard' };
const item = (base=card, skill:'comprehension'|'listening'|'production'|'writing'='comprehension'): ScheduledCard => {
  const schedule = migrateSchedule(base,'user',skill,[],now);
  return {...base,schedule,sessionKey:schedule.id};
};
beforeEach(async()=>{ await localDB.clearForFullRestore(); });

it('creates one independent schedule per skill, not per visual variation',()=>{
  expect(cardModes(card).map(item=>item.skill).sort()).toEqual(['comprehension','listening','production','writing']);
});
it('Easy never returns before its due date, even after a session reload', async()=>{
  const current=item(); const schedule=answerSchedule(current.schedule,'easy',now);
  expect(schedule.memory.state).toBe(State.Review);
  expect(Date.parse(schedule.memory.due)).toBeGreaterThan(now.getTime());
  const updated={...current,schedule};
  expect(pickDueCard([updated],now)).toBeNull();
  expect(pickDueCard([updated],new Date(Date.parse(schedule.memory.due)-1))).toBeNull();
  expect(pickDueCard([updated],new Date(schedule.memory.due))?.id).toBe(card.id);
  await localDB.saveSkillSchedules([schedule]);
  const loaded=await loadScheduledCards([card],'user');
  expect(loaded.find(row=>row.sessionKey===schedule.id)?.schedule).toEqual(schedule);
});
it('Good learning returns at its time, not after a number of answers',()=>{
  const current=item(); const updated={...current,schedule:answerSchedule(current.schedule,'good',now)};
  expect(updated.schedule.memory.state).toBe(State.Learning);
  expect(Date.parse(updated.schedule.memory.due)-now.getTime()).toBe(600000);
  for(let i=0;i<30;i++) expect(pickDueCard([updated],now)).toBeNull();
  expect(pickDueCard([updated],new Date(now.getTime()+600000))?.id).toBe('a');
});
it('Again returns at one minute for a new exercise',()=>{
  const current=item();const updated={...current,schedule:answerSchedule(current.schedule,'again',now)};
  expect(pickDueCard([updated],new Date(now.getTime()+59999))).toBeNull();
  expect(pickDueCard([updated],new Date(now.getTime()+60000))?.id).toBe('a');
});
it('buries siblings for the study day without changing their memory',()=>{
  const reading=item(); const speaking=item(card,'production');
  const updated={...reading,schedule:answerSchedule(reading.schedule,'easy',now)};
  const original=JSON.stringify(speaking.schedule);
  expect(pickDueCard([updated,speaking],now)).toBeNull();
  expect(availableAt(speaking,[updated,speaking],now)).toBe(nextStudyDay(now).getTime());
  expect(pickDueCard([updated,speaking],nextStudyDay(now))?.sessionKey).toBe(speaking.sessionKey);
  expect(JSON.stringify(speaking.schedule)).toBe(original);
});
it('preserves future legacy due dates for every skill during migration',async()=>{
  const due='2030-01-01T12:00:00.000Z';
  const migrated=await loadScheduledCards([{...card,status:'review',dueDate:due}],'user');
  expect(migrated).toHaveLength(4);
  expect(migrated.every(row=>row.schedule.memory.due===due)).toBe(true);
  expect(pickDueCard(migrated,now)).toBeNull();
});
it('adding a new card cannot reintroduce an Easy exercise',()=>{
  const old=item();const updated={...old,schedule:answerSchedule(old.schedule,'easy',now)};
  const added=item({...card,id:'b'});
  expect(pickDueCard([updated,added],now)?.id).toBe('b');
});
it('keeps user schedules separate and gives concept cards one schedule',async()=>{
  const plain={...card,front:'<p>a/an</p>',back:'<p>Um/uma</p>'};
  const a=await loadScheduledCards([plain],'user');
  const b=await loadScheduledCards([plain],'other');
  expect(a).toHaveLength(1);expect(b).toHaveLength(1);
  expect(a[0].sessionKey).not.toBe(b[0].sessionKey);
});
