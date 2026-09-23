import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
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
it('interleaves source cards even when the same skill is the only alternative',()=>{
  const variants=[item(card,'writing'),item(card,'listening'),item({...card,id:'b'},'production')];
  expect(pickDueCard(variants,now,'production','a')?.id).toBe('b');
});
it('randomizes eligible cards instead of always using the first identifier',()=>{
  const random=vi.spyOn(Math,'random');
  try {
    const candidates=[item(),item({...card,id:'b'}),item({...card,id:'c'})];
    random.mockReturnValue(0);expect(pickDueCard(candidates,now)?.id).toBe('a');
    random.mockReturnValue(.99);expect(pickDueCard(candidates,now)?.id).toBe('c');
  } finally {random.mockRestore();}
});
it('only repeats a source when no other source is due, without advancing future cards',()=>{
  const current=item();const future=item({...card,id:'b',dueDate:new Date(now.getTime()+60000).toISOString()});
  expect(pickDueCard([current,future],now,undefined,'a')?.id).toBe('a');
  expect(pickDueCard([future],now,undefined,'a')).toBeNull();
});

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
it('leaves other skills eligible at their own due time',()=>{
  const reading=item(); const speaking=item(card,'production');
  const updated={...reading,schedule:answerSchedule(reading.schedule,'easy',now)};
  const original=JSON.stringify(speaking.schedule);
  expect(pickDueCard([updated,speaking],now)?.sessionKey).toBe(speaking.sessionKey);
  expect(availableAt(speaking,[updated,speaking],now)).toBe(now.getTime());
  expect(pickDueCard([updated,speaking],nextStudyDay(now))?.sessionKey).toBe(speaking.sessionKey);
  expect(JSON.stringify(speaking.schedule)).toBe(original);
});

it('uses 330 seconds for Hard, two Good steps, and four study days for Easy',()=>{
  const initial=item().schedule;
  expect(Date.parse(answerSchedule(initial,'hard',now).memory.due)-now.getTime()).toBe(330000);
  const good=answerSchedule(initial,'good',now);
  const graduated=answerSchedule(good,'good',new Date(good.memory.due));
  expect(graduated.memory.state).toBe(State.Review);
  expect(graduated.memory.scheduled_days).toBe(1);
  expect(answerSchedule(initial,'easy',now).memory.scheduled_days).toBe(4);
});
it('uses traditional review multipliers and updates each exercise ease',()=>{
  const initial=item().schedule;
  const review={...initial,memory:{...initial.memory,state:State.Review,scheduled_days:10},traditional:{easeFactor:2.5,step:0}};
  expect(answerSchedule(review,'hard',now).memory.scheduled_days).toBe(12);
  expect(answerSchedule(review,'good',now).memory.scheduled_days).toBe(25);
  expect(answerSchedule(review,'easy',now).memory.scheduled_days).toBe(33);
  expect(answerSchedule(review,'hard',now).traditional?.easeFactor).toBe(2.35);
  const failed=answerSchedule(review,'again',now);
  expect(failed.memory.state).toBe(State.Relearning);
  expect(Date.parse(failed.memory.due)-now.getTime()).toBe(600000);
  expect(failed.traditional?.easeFactor).toBe(2.3);
});
it('does not let an Easy speaking answer delay a failed writing exercise',()=>{
  const writing=item(card,'writing'), speaking=item(card,'production');
  writing.schedule=answerSchedule(writing.schedule,'again',now);
  speaking.schedule=answerSchedule(speaking.schedule,'easy',now);
  expect(pickDueCard([writing,speaking],new Date(now.getTime()+60000))?.sessionKey).toBe(writing.sessionKey);
});
it('credits overdue days and never lowers ease below 1.3',()=>{
  const initial=item().schedule;
  const due=new Date(now); due.setDate(due.getDate()-4);
  const review={...initial,memory:{...initial.memory,due:due.toISOString(),state:State.Review,scheduled_days:10},traditional:{easeFactor:2.5,step:0}};
  expect(answerSchedule(review,'good',now).memory.scheduled_days).toBe(30);
  expect(answerSchedule(review,'easy',now).memory.scheduled_days).toBe(46);
  expect(answerSchedule({...review,traditional:{easeFactor:1.3,step:0}},'again',now).traditional?.easeFactor).toBe(1.3);
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
