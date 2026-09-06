import { describe,expect,it } from 'vitest';
import { availableSituationModes,chooseAdaptiveMode,parseAdaptiveEvent,type AdaptiveEvent } from '@/lib/adaptive-study';

describe('adaptive multimodal study',()=>{
  it('creates all six exercises from one complete situation',()=>{
    expect(availableSituationModes({hasImage:true,hasAudio:true,hasEnglish:true,hasPortuguese:true})).toHaveLength(6);
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
});
