import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import JSZip from 'jszip';

// Private output is gitignored. Never print rows, passwords or session tokens.
export function copyValue(value) {
  if (value === '\\N') return null;
  return value.replace(/\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|.)/gs, (_, escape) => {
    if (/^[0-7]+$/.test(escape)) return String.fromCharCode(parseInt(escape, 8));
    if (/^x[0-9a-f]+$/i.test(escape)) return String.fromCharCode(parseInt(escape.slice(1), 16));
    return ({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','\\':'\\'})[escape] ?? escape;
  });
}
export function readCopy(sql) {
  const tables = new Map();
  const pattern = /^COPY ((?:public|auth)\.\w+) \(([^\n]+)\) FROM stdin;\r?\n([\s\S]*?)^\\\.$/gm;
  for (const match of sql.matchAll(pattern)) {
    const columns = match[2].split(', ').map(column => column.replaceAll('"',''));
    const rows = match[3].trimEnd().split('\n').filter(Boolean).map(line => {
      const values = line.replace(/\r$/,'').split('\t');
      if(values.length!==columns.length) throw new Error('Invalid COPY row in '+match[1]);
      return Object.fromEntries(columns.map((column,index) => {
        let value = copyValue(values[index]);
        if (value !== null && ['flagged','enabled','include_media','is_anonymous'].includes(column)) value=value==='t';
        if (value !== null && ['interval','ease_factor','steps_index','repetition','review_count','lapse_count','card_count','audio_count','adaptive_level','use_count','weekday','retention_count','size_bytes','manual_stage'].includes(column)) value=Number(value);
        if(value && ['preferences','legacy','raw_user_meta_data'].includes(column)) value=JSON.parse(value);
        return [column,value];
      }));
    });
    tables.set(match[1],rows);
  }
  return tables;
}
const quote = text => "'"+String(text).replaceAll("'","''")+"'";
export async function prepare(database, storage) {
  const tables = readCopy(gunzipSync(await fs.readFile(database)).toString('utf8'));
  const output = path.resolve('.migration-private');
  await fs.mkdir(output,{recursive:true});
  const statements = [await fs.readFile('cloudflare/schema.sql','utf8')];
  const counts={};
  for(const [table,rows] of tables) {
    if(table==='auth.users') {
      for(const user of rows) {
        if(user.deleted_at || !user.encrypted_password) throw new Error('An account requires manual recovery');
        const publicUser = {id:user.id,email:user.email,aud:'authenticated',role:'authenticated',email_confirmed_at:user.email_confirmed_at,created_at:user.created_at,app_metadata:{provider:'email',providers:['email']},user_metadata:user.raw_user_meta_data || {}};
        statements.push(`INSERT INTO users(id,email,password_hash,profile) VALUES(${quote(user.id)},${quote(user.email.toLowerCase())},${quote(user.encrypted_password)},${quote(JSON.stringify(publicUser))});`);
      }
      counts.users=rows.length;
    } else if(table.startsWith('public.')) {
      const name=table.slice(7); counts[name]=rows.length;
      for(const row of rows) statements.push(`INSERT INTO records(collection,id,user_id,data) VALUES(${quote(name)},${quote(row.id || row.user_id)},${quote(row.user_id)},${quote(JSON.stringify(row))});`);
    }
  }
  await fs.writeFile(path.join(output,'import.sql'),statements.join('\n'));
  const archive=await JSZip.loadAsync(await fs.readFile(storage));
  let assets=0,totalBytes=0,maxBytes=0;
  const manifest=[];
  const assetsRoot=path.resolve('cloudflare/assets');
  await fs.mkdir(assetsRoot,{recursive:true});
  for(const entry of Object.values(archive.files)) {
    if(entry.dir)continue;
    const segments=entry.name.split('/');
    if(segments[0]!=='paomzgkwglvshrztebni' || !['card-media','deck-audios','user-backups'].includes(segments[1]))throw new Error('Unexpected archive entry');
    const relative=segments.slice(1).join('/');
    const target=path.resolve(assetsRoot,'storage/v1/object/public',relative);
    if(!target.startsWith(assetsRoot+path.sep))throw new Error('Unsafe archive path');
    const bytes=await entry.async('nodebuffer');
    if(bytes.length>25*1024*1024)throw new Error('Asset exceeds free static asset size limit');
    await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,bytes);
    manifest.push({path:relative,size:bytes.length}); assets++;totalBytes+=bytes.length;maxBytes=Math.max(maxBytes,bytes.length);
  }
  await fs.writeFile(path.join(output,'media-manifest.json'),JSON.stringify(manifest));
  await fs.writeFile(path.join(output,'counts.json'),JSON.stringify(counts));
  console.log(JSON.stringify({counts,assets,totalBytes,maxBytes}));
}
if(process.argv[1]?.endsWith('prepare-cloudflare-migration.mjs')) await prepare(process.argv[2],process.argv[3]);
