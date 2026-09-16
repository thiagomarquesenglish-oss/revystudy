import { describe,expect,it } from 'vitest';
import { availableSituationModes,chooseAdaptiveMode,chooseAlternatingMode,chooseRotatingMode,coreSituationModes,exerciseInfo,parseAdaptiveEvent,type AdaptiveEvent } from '@/lib/adaptive-study';

describe('adaptive multimodal study',()=>{
  it('creates useful multimodal variations plus dictation without an isolated image prompt',()=>{
    const modes=availableSituationModes({hasImage:true,hasAudio:true,hasEnglish:true,hasPortuguese:true});
    expect(modes).toHaveLength(6);
    expect(modes).not.toContain('image-production');
    expect(modes).toContain('image-translation-production');
  });

  it('does not schedule the ambiguous image-only variation',()=>{
    expect(coreSituationModes).toEqual([
      'audio-comprehension','text-comprehension',
      'translation-production','image-audio','image-translation-production',
    ]);
  });

  it('stores the skill and exercise inside the existing review history',()=>{
    expect(parseAdaptiveEvent({rating:'hard',skill:'writing',exercise_mode:'audio-dictation',reviewed_at:'2026-09-06T10:00:00Z'})).toMatchObject({rating:'hard',skill:'writing',mode:'audio-dictation'});
  });

  it('prioritizes a weak skill without creating another card',()=>{
    const events:AdaptiveEvent[]=[
      {rating:'easy',skill:'comprehension',mode:'text-comprehension',reviewedAt:''},
      {rating:'again',skill:'writing',mode:'audio-dictation',reviewedAt:''},
    ];
    expect(chooseAdaptiveMode(['text-comprehension','audio-dictation'],events)).toBe('audio-dictation');
  });

  it('never repeats a skill when another one is available',()=>{
    const available=availableSituationModes({hasImage:true,hasAudio:true,hasEnglish:true,hasPortuguese:true});
    let previous=chooseAlternatingMode(available,[]);
    for(let index=0;index<20;index++){
      const next=chooseAlternatingMode(available,[],previous);
      expect(exerciseInfo[next].skill).not.toBe(exerciseInfo[previous].skill);
      previous=next;
    }
  });

  it('shows every available skill, including writing, before starting a new cycle',()=>{
    const available=availableSituationModes({hasImage:true,hasAudio:true,hasEnglish:true,hasPortuguese:true});
    const recent:typeof available=[];
    for(let index=0;index<4;index++)recent.push(chooseRotatingMode(available,[],recent));
    expect(new Set(recent.map(mode=>exerciseInfo[mode].skill))).toEqual(new Set(['production','listening','comprehension','writing']));
  });
});
