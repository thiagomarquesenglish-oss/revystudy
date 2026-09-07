import type { Rating } from './types';

export type LearningSkill = 'comprehension'|'listening'|'production'|'writing';
export type ExerciseMode = 'image-production'|'audio-comprehension'|'text-comprehension'|'image-audio'|'translation-production'|'image-translation-production'|'audio-dictation';

export interface AdaptiveEvent { rating: Rating; skill: LearningSkill; mode: ExerciseMode; reviewedAt: string }

export const exerciseInfo: Record<ExerciseMode,{label:string;skill:LearningSkill}> = {
  'image-production': { label:'Imagem → falar em inglês', skill:'production' },
  'audio-comprehension': { label:'Áudio → compreender', skill:'listening' },
  'text-comprehension': { label:'Inglês → compreender', skill:'comprehension' },
  'image-audio': { label:'Imagem + áudio → associar', skill:'listening' },
  'translation-production': { label:'Português → falar em inglês', skill:'production' },
  'image-translation-production': { label:'Imagem + português → falar em inglês', skill:'production' },
  'audio-dictation': { label:'Áudio → escrever em inglês', skill:'writing' },
};

export const coreSituationModes:ExerciseMode[]=[
  'image-production',
  'audio-comprehension',
  'text-comprehension',
  'translation-production',
  'image-audio',
  'image-translation-production',
];

export function parseAdaptiveEvent(row: {rating?:string;skill?:string|null;exercise_mode?:string|null;reviewed_at?:string}): AdaptiveEvent|null {
  const rating=row.rating||'',skill=row.skill||'',mode=row.exercise_mode||'';
  if(!['again','hard','good','easy'].includes(rating)||!['comprehension','listening','production','writing'].includes(skill)||!(mode in exerciseInfo))return null;
  return {rating:rating as Rating,skill:skill as LearningSkill,mode:mode as ExerciseMode,reviewedAt:row.reviewed_at||''};
}

const ratingScore:Record<Rating,number>={again:0,hard:.4,good:.9,easy:1};

export function chooseAdaptiveMode(available:ExerciseMode[],events:AdaptiveEvent[],last?:ExerciseMode|null):ExerciseMode {
  if(!available.length)return 'text-comprehension';
  const recent=events.slice(-24);
  const skillStrength=(skill:LearningSkill)=>{
    const values=recent.filter(e=>e.skill===skill||(skill==='listening'&&e.mode==='audio-dictation')).slice(-6).map(e=>ratingScore[e.rating]);
    return values.length?values.reduce((a,b)=>a+b,0)/values.length:.45;
  };
  const modeAttempts=(mode:ExerciseMode)=>recent.filter(e=>e.mode===mode).length;
  const stage=events.length<3?1:events.length<8?2:events.length<16?3:4;
  const difficulty:Record<ExerciseMode,number>={
    'image-audio':1,'image-translation-production':1,
    'text-comprehension':2,'translation-production':2,
    'audio-comprehension':3,'image-production':3,
    'audio-dictation':4,
  };
  const scored=available.map((mode,index)=>{
    const weakness=1-skillStrength(exerciseInfo[mode].skill);
    const exploration=1/(1+modeAttempts(mode));
    const repeatPenalty=mode===last?.35:0;
    // Stable tiny tie breaker prevents a fixed first mode while keeping tests deterministic.
    const rotation=((events.length+index)%available.length)/100;
    const stageFit=1-Math.min(1,Math.abs(difficulty[mode]-stage)/3);
    const translationPenalty=mode==='translation-production'?.18:0;
    return {mode,score:weakness*2+exploration+stageFit-translationPenalty-repeatPenalty+rotation};
  });
  return scored.sort((a,b)=>b.score-a.score)[0].mode;
}

export function availableSituationModes(input:{hasImage:boolean;hasAudio:boolean;hasEnglish:boolean;hasPortuguese:boolean}):ExerciseMode[]{
  const modes:ExerciseMode[]=[];
  if(input.hasImage&&input.hasEnglish)modes.push('image-production');
  if(input.hasAudio)modes.push('audio-comprehension');
  if(input.hasEnglish)modes.push('text-comprehension');
  if(input.hasImage&&input.hasAudio)modes.push('image-audio');
  if(input.hasPortuguese&&input.hasEnglish)modes.push('translation-production');
  if(input.hasImage&&input.hasPortuguese&&input.hasEnglish)modes.push('image-translation-production');
  if(input.hasAudio&&input.hasEnglish)modes.push('audio-dictation');
  return modes;
}
