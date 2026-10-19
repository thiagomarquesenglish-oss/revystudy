import { expect, it } from 'vitest';
import { copyValue, readCopy } from '../../scripts/prepare-cloudflare-migration.mjs';
import { parseFilters, projectRow } from '../../cloudflare/worker.js';
it('imports PostgreSQL COPY escapes, booleans and numbers without losing card text', () => {
  const rows=readCopy('COPY public.cards (id, front, back, flagged, review_count) FROM stdin;\na\tLine\\nsecond\\tpart\\\\end\t\\N\tt\t3\n\\.\n').get('public.cards');
  expect(rows).toEqual([{id:'a',front:'Line\nsecond\tpart\\end',back:null,flagged:true,review_count:3}]);
  expect(copyValue('\\303')).toBe('Ã');
});
it('binds query values and rejects unsupported/injected field names', () => {
  const result=parseFilters(new URLSearchParams({user_id:'eq.user',id:'in.(a,b)',flagged:'eq.true',review_count:'gte.3',select:'id'}));
  expect(result.bindings).toEqual(['user','a','b',1,3]);
  expect(result.conditions).toHaveLength(4);
  expect(()=>parseFilters(new URLSearchParams({"id'); DROP TABLE users;--":'eq.x'}))).toThrow();
  expect(()=>parseFilters(new URLSearchParams({id:'not.eq.a'}))).toThrow();
});
it('only returns requested record fields', () => {
  expect(projectRow({id:'one',name:'Deck',user_id:'owner'},'id,name')).toEqual({id:'one',name:'Deck'});
  expect(()=>projectRow({},'id,(SELECT password_hash FROM users)')).toThrow();
});
