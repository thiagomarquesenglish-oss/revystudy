import { expect, it } from 'vitest';
import { copyValue, readCopy } from '../../scripts/prepare-cloudflare-migration.mjs';
import { multipartFile, parseFilters, projectRow } from '../../cloudflare/worker.js';
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
it('preserves binary audio in the SDK multipart upload with an empty field name',()=>{
  const head=new TextEncoder().encode('--test\r\nContent-Disposition: form-data; name="cacheControl"\r\n\r\n3600\r\n--test\r\nContent-Disposition: form-data; name=""; filename="blob"\r\nContent-Type: audio/mpeg\r\n\r\n');
  const data=new Uint8Array([255,0,128,73,68,51]),tail=new TextEncoder().encode('\r\n--test--\r\n');
  const body=new Uint8Array([...head,...data,...tail]);const result=multipartFile(body.buffer,'multipart/form-data; boundary=test');
  expect(new Uint8Array(result.bytes)).toEqual(data);expect(result.contentType).toBe('audio/mpeg');
});
