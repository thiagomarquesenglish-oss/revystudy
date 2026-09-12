import { describe,expect,it } from 'vitest';
import { availableSituationModes,chooseAdaptiveMode,chooseAlternatingMode,coreSituationModes,exerciseInfo,parseAdaptiveEvent,type AdaptiveEvent } from '@/lib/adaptive-study';

describe('adaptive multimodal study',()=>{
  it('creates the six multimodal variations plus dictation from one situation',()=>{
    expect(availableSituationModes({hasImage:true,hasAudio:true,hasEnglish:true,hasPortuguese:true})).toHaveLength(7);
    expect(availableSituationModes({hasImage:true,hasAudio:true,hasEnglish:true,hasPortuguese:true})).toContain('image-translation-production');
  });

  it('puts exactly the requested six variations into scheduled sessions',()=>{
    expect(coreSituationModes).toEqual([
      'image-production','audio-comprehension','text-comprehension',
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
});
