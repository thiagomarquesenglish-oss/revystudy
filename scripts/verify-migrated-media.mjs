import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='https://revystudy-cloud.revystudy-thiago-fc24.workers.dev/storage/v1/object/public/';
const manifest=JSON.parse(await fs.readFile('.migration-private/media-manifest.json','utf8'));
let index=0,checked=0;const failures=[];
await Promise.all(Array.from({length:4},async()=>{
  while(index<manifest.length) {
    const entry=manifest[index++];
    try {
      const response=await fetch(base+entry.path.split('/').map(encodeURIComponent).join('/'),{headers:{Range:'bytes=0-0'}});
      assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 0-0/${entry.size}`);assert.equal((await response.arrayBuffer()).byteLength,1);
      if(entry.path.endsWith('.mp3'))assert.ok(response.headers.get('content-type')?.startsWith('audio/mpeg'));
      checked++;
    }catch{failures.push(entry.path);}
  }
}));
await fs.writeFile('.migration-private/media-verification.json',JSON.stringify({checked,total:manifest.length,failures}));
console.log(JSON.stringify({checked,total:manifest.length,failed:failures.length}));
if(failures.length)process.exitCode=1;
