import 'fake-indexeddb/auto';
import {expect,it} from 'vitest';
import {matchesCardMedia} from '@/lib/card-media-filter';
import {localDB} from '@/lib/offline-db';
const card={front:'Text',back:'Translation',audioId:null};
it('filters text-only and mixed cards',()=>{
  expect(matchesCardMedia(card,'text-only')).toBe(true);
  const mixed={...card,front:'<img src="image.png">',audioId:'audio'};
  expect(matchesCardMedia(mixed,'no-image')).toBe(false);
  expect(matchesCardMedia(mixed,'no-audio')).toBe(false);
  expect(matchesCardMedia(mixed,'has-image')).toBe(true);
  expect(matchesCardMedia(mixed,'has-audio')).toBe(true);
});
it('recognizes audio in either face, source tags, and editor nodes',()=>{
  for(const back of ['<audio src="a.mp3"></audio>','<audio><source src="a.mp3"></audio>','<div data-audio data-src="a.mp3"></div>']) expect(matchesCardMedia({...card,back},'no-audio')).toBe(false);
  expect(matchesCardMedia({...card,back:'<audio></audio><img src="">'},'text-only')).toBe(true);
});
it('preserves detection of embedded media in lightweight summaries',async()=>{
  await localDB.commitLearningBatch([{id:'media-filter-test',front:'<img src="data:image/png;base64,AAAA">',back:'<audio src="data:audio/mp3;base64,AAAA"></audio>'}]);
  const row=(await localDB.getCardSummaries()).find(row=>row.id==='media-filter-test');
  expect(row.front).not.toContain('base64');
  expect(matchesCardMedia({...row,audioId:null},'has-image')).toBe(true);
  expect(matchesCardMedia({...row,audioId:null},'has-audio')).toBe(true);
  await localDB.deleteCard('media-filter-test');
});
