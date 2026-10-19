const COLLECTIONS = new Set(['decks','cards','review_history','deck_audios','dictation_reviews','learning_explanations','learning_settings','backup_settings','backup_runs']);
const PUBLIC_BUCKETS = new Set(['card-media','deck-audios']);
const BUCKETS = new Set([...PUBLIC_BUCKETS,'user-backups']);
const encoder = new TextEncoder();
const now = () => Math.floor(Date.now()/1000);
const json = (value,status=200,headers={}) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const failure = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
const escapeIdentifier = name => {if(!/^[a-z_]+$/.test(name))failure('Campo inválido.');return name;};
const field = name => `json_extract(data,'$.${escapeIdentifier(name)}')`;

export function parseFilters(params) {
  const conditions=[],bindings=[];
  for(const [key,value] of params) {
    if(['select','order','limit','offset','on_conflict','columns'].includes(key))continue;
    const column=field(key);
    const match=value.match(/^(eq|neq|gt|gte|lt|lte|is|in|ilike)\.(.*)$/s);
    if(!match)failure('Filtro não suportado.');
    const [,operator,raw]=match;
    if(operator==='in') {
      if(!raw.startsWith('(')||!raw.endsWith(')'))failure('Lista inválida.');
      const list=raw.slice(1,-1).split(',').map(item=>item.replace(/^"|"$/g,''));
      if(list.length>1000)failure('Lista grande demais.');
      conditions.push(`${column} IN (${list.map(()=>'?').join(',')})`);bindings.push(...list);
    } else if(operator==='is') {
      if(!['null','true','false'].includes(raw))failure('Filtro inválido.');
      conditions.push(`${column} IS ${raw==='null'?'NULL':raw==='true'?'1':'0'}`);
    } else {
      conditions.push(`${column} ${{eq:'=',neq:'!=',gt:'>',gte:'>=',lt:'<',lte:'<=',ilike:'LIKE'}[operator]} ?`);
      bindings.push(raw==='true'?1:raw==='false'?0:/^-?\d+(\.\d+)?$/.test(raw)?Number(raw):raw);
    }
  }
  return {conditions,bindings};
}
export function projectRow(row,select) {
  if(!select || select==='*')return row;
  const result={};for(const key of select.split(',')){escapeIdentifier(key);result[key]=row[key]??null;}return result;
}
async function principal(request,env) {
  const bearer=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!bearer)failure('Sua sessão expirou.',401);
  if((env.ADMIN_KEY && bearer.length===env.ADMIN_KEY.length && await digest(bearer)===await digest(env.ADMIN_KEY)) || (env.LEGACY_ADMIN_HASH && await digest(bearer)===env.LEGACY_ADMIN_HASH))return {admin:true};
  const session=await env.DB.prepare('SELECT user_id FROM sessions WHERE access_hash=? AND expires_at>?').bind(await digest(bearer),now()).first();
  if(!session)failure('Sua sessão expirou.',401);
  return {id:session.user_id};
}
async function rateLimit(request,env,email) {
  for(const key of ['ip:'+(request.headers.get('CF-Connecting-IP')||'unknown'),'email:'+await digest(email)]) {
    const limit=await env.DB.prepare('INSERT INTO login_limits(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END RETURNING attempts').bind(key,now()+300,now(),now()).first();
    if(limit.attempts>12)failure('Muitas tentativas. Aguarde cinco minutos.',429);
  }
}
async function sessionFor(env,user) {
  const access=token(),refresh=token(),expires=now()+3600;
  await env.DB.prepare('INSERT INTO sessions(access_hash,refresh_hash,user_id,expires_at,refresh_expires_at) VALUES(?,?,?,?,?)').bind(await digest(access),await digest(refresh),user.id,expires,now()+30*86400).run();
  return {access_token:access,refresh_token:refresh,token_type:'bearer',expires_in:3600,expires_at:expires,user:JSON.parse(user.profile)};
}
async function verifyPassword(env,password,hash) {
  // bcrypt runs on the existing Vercel Node server, avoiding Workers Free's CPU limit.
  // The bridge accepts only signed, short-lived requests from this Worker.
  const payload=JSON.stringify({password,hash,expires:now()+30,nonce:token()});
  const key=await crypto.subtle.importKey('jwk',JSON.parse(env.AUTH_BRIDGE_PRIVATE_JWK),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(payload));
  const signed=btoa(String.fromCharCode(...new Uint8Array(signature)));
  const response=await fetch('https://revystudy.vercel.app/api/verify-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature:signed}),redirect:'error'});
  if(!response.ok)failure('Não foi possível verificar sua senha. Tente novamente.',503);
  return (await response.json()).valid===true;
}
async function auth(request,url,env) {
  if(url.pathname==='/auth/v1/token' && request.method==='POST') {
    const body=await request.json();
    if(url.searchParams.get('grant_type')==='refresh_token') {
      const saved=await env.DB.prepare('SELECT * FROM sessions WHERE refresh_hash=? AND refresh_expires_at>?').bind(await digest(String(body.refresh_token||'')),now()).first();
      if(!saved)failure('Sua sessão expirou.',401);
      const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(saved.user_id).first();
      if(!user)failure('Sua sessão expirou.',401);
      // Retain a brief overlap for concurrent tabs; old tokens never extend their own expiry.
      await env.DB.prepare('UPDATE sessions SET refresh_expires_at=MIN(refresh_expires_at,?) WHERE access_hash=?').bind(now()+60,saved.access_hash).run();
      return json(await sessionFor(env,user));
    }
    if(url.searchParams.get('grant_type')!=='password')failure('Login não suportado.');
    const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
    if(!email || !password || password.length>256)failure('Informe seu email e senha.');
    await rateLimit(request,env,email);
    const user=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    // Constant bcrypt cost also for unknown accounts, to avoid account enumeration.
    const dummy='$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    const valid=await verifyPassword(env,password,user?.password_hash||dummy);
    if(!valid || !user)failure('Email ou senha incorretos.',400);
    return json(await sessionFor(env,user));
  }
  const user=await principal(request,env);
  if(url.pathname==='/auth/v1/user' && request.method==='GET') {
    if(user.admin)failure('Uma sessão de usuário é necessária.',401);
    const row=await env.DB.prepare('SELECT profile FROM users WHERE id=?').bind(user.id).first();
    if(!row)failure('Conta não encontrada.',401);return json(JSON.parse(row.profile));
  }
  if(url.pathname==='/auth/v1/logout' && request.method==='POST') {
    if(!user.admin)await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id).run();
    return new Response(null,{status:204});
  }
  failure('Use sua conta já cadastrada para entrar.',403);
}
async function getRows(env,table,user,params) {
  const {conditions,bindings}=parseFilters(params);
  const sql=['collection=?'];const args=[table];
  if(!user.admin){sql.push('user_id=?');args.push(user.id);}
  sql.push(...conditions);args.push(...bindings);
  return {where:sql.join(' AND '),args};
}
async function touchDeck(env,userId,deckId,updated) {
  if(!deckId)return;
  const row=await env.DB.prepare("SELECT data FROM records WHERE collection='decks' AND id=? AND user_id=?").bind(deckId,userId).first();
  if(!row)return;
  const deck=JSON.parse(row.data);
  const counts=await env.DB.prepare("SELECT collection,COUNT(*) AS n FROM records WHERE collection IN ('cards','deck_audios') AND user_id=? AND json_extract(data,'$.deck_id')=? GROUP BY collection").bind(userId,deckId).all();
  deck.card_count=counts.results.find(row=>row.collection==='cards')?.n||0;
  deck.audio_count=counts.results.find(row=>row.collection==='deck_audios')?.n||0;
  if(updated)deck.content_updated_at=new Date().toISOString();
  await env.DB.prepare("UPDATE records SET data=? WHERE collection='decks' AND id=? AND user_id=?").bind(JSON.stringify(deck),deckId,userId).run();
}
async function rest(request,url,env) {
  const user=await principal(request,env),table=url.pathname.slice('/rest/v1/'.length);
  if(!COLLECTIONS.has(table))failure('Tabela não disponível.',404);
  const query=await getRows(env,table,user,url.searchParams);
  const select=url.searchParams.get('select')||'*';
  if(request.method==='GET' || request.method==='HEAD') {
    let order='';
    if(url.searchParams.has('order')) order=' ORDER BY '+url.searchParams.get('order').split(',').map(item=>{const [name,direction]=item.split('.');if(direction && !['asc','desc'].includes(direction))failure('Ordem inválida.');return field(name)+(direction==='desc'?' DESC':' ASC');}).join(',');
    const range=request.headers.get('range')?.match(/^(\d+)-(\d+)$/);
    const offset=range?Number(range[1]):Number(url.searchParams.get('offset')||0);
    const limit=range?Number(range[2])-offset+1:Number(url.searchParams.get('limit')||1000);
    if(!Number.isInteger(limit)||limit<0||limit>5000||!Number.isInteger(offset)||offset<0)failure('Página inválida.');
    const result=await env.DB.prepare('SELECT data FROM records WHERE '+query.where+order+' LIMIT ? OFFSET ?').bind(...query.args,limit,offset).all();
    const rows=result.results.map(row=>projectRow(JSON.parse(row.data),select));
    const single=(request.headers.get('Accept')||'').includes('application/vnd.pgrst.object+json');
    if(single && rows.length!==1)return json({code:'PGRST116',details:`The result contains ${rows.length} rows`,message:'JSON object requested, multiple (or no) rows returned'},406);
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM records WHERE '+query.where).bind(...query.args).first();
    return json(single?rows[0]:rows,200,{'Content-Range':`${rows.length?offset+'-'+(offset+rows.length-1):'*'}/${count.n}`});
  }
  if(!['POST','PATCH','DELETE'].includes(request.method))failure('Método não permitido.',405);
  const output=[],touched=new Map();
  if(request.method==='POST') {
    const body=await request.json(),inputs=Array.isArray(body)?body:[body];
    if(!inputs.length||inputs.length>100)failure('Envie até 100 registros por vez.');
    const upsert=(request.headers.get('Prefer')||'').includes('resolution=merge-duplicates');
    const conflict=url.searchParams.get('on_conflict')?.split(',') || ((table==='backup_settings'||table==='learning_settings')?['user_id']:['id']);
    for(const input of inputs) {
      if(!input || typeof input!=='object')failure('Registro inválido.');
      const owner=user.admin?input.user_id:user.id;
      if(!owner || (!user.admin && input.user_id && input.user_id!==user.id))failure('Acesso negado.',403);
      let id=input.id||(['backup_settings','learning_settings'].includes(table)?owner:crypto.randomUUID());
      let existing=await env.DB.prepare('SELECT * FROM records WHERE collection=? AND id=?').bind(table,id).first();
      if(existing && existing.user_id!==owner)failure('Acesso negado.',403);
      if(upsert && conflict.some(key=>key!=='id') && conflict.every(key=>input[key]!==undefined)) {
        const found=await env.DB.prepare('SELECT * FROM records WHERE collection=? AND user_id=? AND '+conflict.map(key=>field(key)+'=?').join(' AND ')).bind(table,owner,...conflict.map(key=>input[key])).first();
        if(found){existing=found;id=found.id;}
      }
      if(existing && !upsert)failure('Registro já existe.',409);
      const timestamp=new Date().toISOString();
      const defaults=table==='cards'?{front:'',back:'',status:'new',interval:0,ease_factor:2.5,steps_index:0,repetition:0,review_count:0,lapse_count:0,due_date:timestamp,audio_id:null,flagged:false,card_type:'standard',dictation_answer:null,adaptive_level:0}:table==='decks'?{description:'',card_count:0,audio_count:0,content_updated_at:timestamp}:table==='learning_explanations'?{use_count:1}:{};
      const row={created_at:timestamp,updated_at:timestamp,...defaults,...(existing?JSON.parse(existing.data):{}),...input,user_id:owner};
      if(!['backup_settings','learning_settings'].includes(table))row.id=id;
      if(['cards','deck_audios'].includes(table)) {
        const parent=await env.DB.prepare("SELECT id FROM records WHERE collection='decks' AND id=? AND user_id=?").bind(row.deck_id,owner).first();
        if(!parent)failure('Baralho não encontrado.',409);
        if(row.audio_id){const audio=await env.DB.prepare("SELECT id FROM records WHERE collection='deck_audios' AND id=? AND user_id=?").bind(row.audio_id,owner).first();if(!audio)failure('Áudio não encontrado.',409);}
      }
      output.push(row);
      if(['cards','deck_audios'].includes(table))touched.set(owner+':'+row.deck_id,{owner,deck:row.deck_id,updated:!existing || ['front','back','audio_id','name','file_path','dictation_answer','deck_id'].some(key=>key in input && input[key]!==JSON.parse(existing.data)[key])});
    }
    // Validate the whole batch before writing any row.
    const statements=output.map(row=>env.DB.prepare('INSERT INTO records(collection,id,user_id,data) VALUES(?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data WHERE records.user_id=excluded.user_id').bind(table,row.id||row.user_id,row.user_id,JSON.stringify(row)));
    await env.DB.batch(statements);
  } else {
    const rows=(await env.DB.prepare('SELECT id,user_id,data FROM records WHERE '+query.where).bind(...query.args).all()).results;
    const patch=request.method==='PATCH'?await request.json():null;
    const statements=[];
    for(const saved of rows) {
      const old=JSON.parse(saved.data),row=patch?{...old,...patch}:old;output.push(row);
      if(patch && ((patch.id!==undefined&&patch.id!==saved.id)||(patch.user_id!==undefined&&patch.user_id!==saved.user_id)))failure('Não é permitido trocar a identidade do registro.',403);
      if(patch?.deck_id && patch.deck_id!==old.deck_id) {
        const parent=await env.DB.prepare("SELECT id FROM records WHERE collection='decks' AND id=? AND user_id=?").bind(patch.deck_id,saved.user_id).first();
        if(!parent)failure('Baralho não encontrado.',409);
        touched.set(saved.user_id+':'+patch.deck_id,{owner:saved.user_id,deck:patch.deck_id,updated:true});
      }
      if(patch)statements.push(env.DB.prepare('UPDATE records SET data=? WHERE collection=? AND id=? AND user_id=?').bind(JSON.stringify(row),table,saved.id,saved.user_id));
      else {
        statements.push(env.DB.prepare('DELETE FROM records WHERE collection=? AND id=? AND user_id=?').bind(table,saved.id,saved.user_id));
        if(table==='decks')statements.push(env.DB.prepare("DELETE FROM records WHERE collection IN ('cards','deck_audios','dictation_reviews','review_history') AND user_id=? AND json_extract(data,'$.deck_id')=?").bind(saved.user_id,saved.id));
        if(table==='cards')statements.push(env.DB.prepare("DELETE FROM records WHERE collection IN ('review_history','dictation_reviews') AND user_id=? AND json_extract(data,'$.card_id')=?").bind(saved.user_id,saved.id));
      }
      if(['cards','deck_audios'].includes(table))touched.set(saved.user_id+':'+old.deck_id,{owner:saved.user_id,deck:old.deck_id,updated:!patch || ['front','back','audio_id','name','file_path','dictation_answer'].some(key=>key in patch && patch[key]!==old[key])});
    }
    for(let offset=0;offset<statements.length;offset+=100)await env.DB.batch(statements.slice(offset,offset+100));
  }
  for(const {owner,deck,updated} of touched.values())await touchDeck(env,owner,deck,updated);
  if(!(request.headers.get('Prefer')||'').includes('return=representation'))return new Response(null,{status:request.method==='POST'?201:204});
  const projected=output.map(row=>projectRow(row,select));
  const single=(request.headers.get('Accept')||'').includes('application/vnd.pgrst.object+json');
  if(single && projected.length!==1)return json({code:'PGRST116',details:`The result contains ${projected.length} rows`,message:'Expected one record'},406);
  return json(single?projected[0]:projected,request.method==='POST'?201:200);
}
function safePath(value) {
  const decoded=decodeURIComponent(value);
  if(decoded.split('/').some(part=>!part||part==='.'||part==='..')||decoded.includes('\\'))failure('Caminho inválido.');
  return decoded;
}
function typeFor(path){return ({mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',webm:'audio/webm',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',zip:'application/zip'})[path.split('.').pop().toLowerCase()]||'application/octet-stream';}
async function storage(request,url,env) {
  const route=url.pathname.slice('/storage/v1/'.length);
  if(request.method==='DELETE' && /^object\/[^/]+$/.test(route)) {
    const bucket=route.slice(7),user=await principal(request,env);if(!BUCKETS.has(bucket))failure('Bucket inválido.');
    const {prefixes}=await request.json();if(!Array.isArray(prefixes)||prefixes.length>100)failure('Lista inválida.');
    const statements=[];
    for(const input of prefixes) {
      const path=safePath(input);if(!user.admin && path.split('/')[0]!==user.id)failure('Acesso negado.',403);
      const owner=user.admin?path.split('/')[0]:user.id;
      statements.push(env.DB.prepare('INSERT INTO uploads(bucket,path,user_id,content_type,size,deleted) VALUES(?,?,?,\'\',0,1) ON CONFLICT(bucket,path) DO UPDATE SET deleted=1,size=0').bind(bucket,path,owner));
      statements.push(env.DB.prepare('DELETE FROM upload_parts WHERE bucket=? AND path=?').bind(bucket,path));
    }
    if(statements.length)await env.DB.batch(statements);return json(prefixes.map(name=>({name})));
  }
  const match=route.match(/^object\/(public\/)?([^/]+)\/(.+)$/);
  if(!match)failure('Rota de arquivo não disponível.',404);
  const [,publicRoute,bucket,rawPath]=match,path=safePath(rawPath);
  if(!BUCKETS.has(bucket))failure('Bucket inválido.',404);
  if(['POST','PUT'].includes(request.method) && !publicRoute) {
    const user=await principal(request,env);if(!user.admin && path.split('/')[0]!==user.id)failure('Acesso negado.',403);
    const length=Number(request.headers.get('Content-Length')||0);if(length>25*1024*1024)failure('Arquivo maior que 25 MB.',413);
    let contentType=request.headers.get('Content-Type')||typeFor(path);
    // Supabase SDK may wrap browser Blob uploads in FormData.
    let bytes;
    if(contentType.startsWith('multipart/form-data')) {
      const form=await request.formData();const file=[...form.values()].find(value=>value instanceof Blob);if(!file)failure('Arquivo ausente.');bytes=await file.arrayBuffer();contentType=file.type||typeFor(path);
    } else bytes=await request.arrayBuffer();
    if(!/^(audio\/|image\/(png|jpeg|webp|gif)|application\/zip|application\/octet-stream)/i.test(contentType))failure('Tipo de arquivo não permitido.',415);
    if(bytes.byteLength>25*1024*1024 || !bytes.byteLength)failure('Tamanho de arquivo inválido.',413);
    const previous=await env.DB.prepare('SELECT size,deleted FROM uploads WHERE bucket=? AND path=?').bind(bucket,path).first();
    if(previous&&!previous.deleted && request.headers.get('x-upsert')!=='true')failure('Arquivo já existe.',409);
    const total=await env.DB.prepare('SELECT COALESCE(SUM(size),0) AS bytes FROM uploads WHERE deleted=0').first();
    if(total.bytes-(previous?.size||0)+bytes.byteLength>300*1024*1024)failure('O armazenamento gratuito de novas mídias está cheio. Exporte e remova arquivos antes de enviar outros.',507);
    const statements=[env.DB.prepare('DELETE FROM upload_parts WHERE bucket=? AND path=?').bind(bucket,path)];
    for(let start=0,part=0;start<bytes.byteLength;start+=512*1024,part++)statements.push(env.DB.prepare('INSERT INTO upload_parts(bucket,path,part,bytes) VALUES(?,?,?,?)').bind(bucket,path,part,bytes.slice(start,start+512*1024)));
    statements.push(env.DB.prepare('INSERT INTO uploads(bucket,path,user_id,content_type,size,deleted) VALUES(?,?,?,?,?,0) ON CONFLICT(bucket,path) DO UPDATE SET content_type=excluded.content_type,size=excluded.size,deleted=0').bind(bucket,path,user.admin?path.split('/')[0]:user.id,typeFor(path)!=='application/octet-stream'?typeFor(path):contentType,bytes.byteLength));
    await env.DB.batch(statements);return json({Key:`${bucket}/${path}`,Id:crypto.randomUUID()},200);
  }
  if(!['GET','HEAD'].includes(request.method))failure('Método não permitido.',405);
  if(!PUBLIC_BUCKETS.has(bucket)) {const user=await principal(request,env);if(!user.admin&&path.split('/')[0]!==user.id)failure('Acesso negado.',403);}
  const uploaded=await env.DB.prepare('SELECT * FROM uploads WHERE bucket=? AND path=?').bind(bucket,path).first();
  if(uploaded?.deleted)failure('Arquivo removido.',404);
  if(!uploaded) {
    const assetUrl=new URL(request.url);assetUrl.pathname='/storage/v1/object/public/'+bucket+'/'+path;assetUrl.search='';
    const response=await env.ASSETS.fetch(new Request(assetUrl,{method:request.method,headers:request.headers}));
    if(response.status===404)failure('Arquivo não encontrado.',404);
    const headers=new Headers(response.headers);headers.set('Content-Type',typeFor(path));headers.set('Cache-Control','public,max-age=86400');headers.set('X-Content-Type-Options','nosniff');
    return new Response(response.body,{status:response.status,headers});
  }
  const parts=await env.DB.prepare('SELECT bytes FROM upload_parts WHERE bucket=? AND path=? ORDER BY part').bind(bucket,path).all();
  const bytes=new Uint8Array(uploaded.size);let offset=0;for(const part of parts.results){const data=new Uint8Array(part.bytes);bytes.set(data,offset);offset+=data.length;}
  const headers={'Content-Type':uploaded.content_type,'Cache-Control':PUBLIC_BUCKETS.has(bucket)?'public,max-age=86400':'private,no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
  const range=request.headers.get('Range');
  if(range){const match=range.match(/^bytes=(\d*)-(\d*)$/);if(!match)failure('Range inválido.',416);let start=match[1]?Number(match[1]):Math.max(0,bytes.length-Number(match[2]));let end=match[1]?(match[2]?Number(match[2]):bytes.length-1):bytes.length-1;if(start>=bytes.length||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});end=Math.min(end,bytes.length-1);return new Response(request.method==='HEAD'?null:bytes.slice(start,end+1),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(end-start+1)}});}
  return new Response(request.method==='HEAD'?null:bytes,{headers:{...headers,'Content-Length':String(bytes.length)}});
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url),origin=request.headers.get('Origin');
    const cors={'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN,'Access-Control-Allow-Methods':'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,x-supabase-api-version,content-type,prefer,range,range-unit,x-upsert,accept','Access-Control-Expose-Headers':'Content-Range,Content-Length,Accept-Ranges','Vary':'Origin'};
    if(origin && origin!==env.ALLOWED_ORIGIN)return json({message:'Origem não autorizada.'},403,cors);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    let response;
    try {
      if(url.pathname==='/health')response=json({status:'ok',backend:'cloudflare'});
      else if(url.pathname.startsWith('/auth/v1/'))response=await auth(request,url,env);
      else if(url.pathname.startsWith('/rest/v1/'))response=await rest(request,url,env);
      else if(url.pathname.startsWith('/storage/v1/'))response=await storage(request,url,env);
      else response=json({message:'Não encontrado.'},404);
    }catch(error){if(!error.status)console.error('Backend request failed',url.pathname,error.message);response=json({message:error.status?error.message:'Não foi possível concluir a operação.',error:error.status?error.message:'Falha no servidor.',code:error.status===401?'bad_jwt':'request_failed'},error.status||500);}
    const headers=new Headers(response.headers);for(const [key,value] of Object.entries(cors))headers.set(key,value);
    return new Response(response.body,{status:response.status,headers});
  }
};
