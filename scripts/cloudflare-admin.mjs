import fs from 'node:fs/promises';
import path from 'node:path';
import { createPrivateKey, sign } from 'node:crypto';
const account='fc24c4132af894dd809f2365444590e6';
export async function api(endpoint,options={}) {
  const config=await fs.readFile(path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8');
  const token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if(!token)throw new Error('Run wrangler login first');
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${endpoint}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers}});
  const body=await response.json();if(!body.success)throw new Error(JSON.stringify(body.errors));return body.result;
}
export async function secret(name,value){await api('/workers/scripts/revystudy-cloud/secrets',{method:'PUT',body:JSON.stringify({name,text:value,type:'secret_text'})});console.log('Secret configured: '+name);}
if(process.argv[2]==='subdomain') {
  let existing;try{existing=await api('/workers/subdomain');}catch{}
  if(existing?.subdomain)console.log('Workers subdomain: '+existing.subdomain);
  else console.log('Workers subdomain: '+(await api('/workers/subdomain',{method:'PUT',body:JSON.stringify({subdomain:'revystudy-thiago-fc24'})})).subdomain);
}
if(process.argv[2]==='keys') {
  await secret('AUTH_BRIDGE_PRIVATE_JWK',await fs.readFile('.migration-private/auth-private.jwk','utf8'));
  await secret('ADMIN_KEY',await fs.readFile('.migration-private/admin-key','utf8'));
}
if(process.argv[2]==='legacy') {
  const privateKey=createPrivateKey({key:JSON.parse(await fs.readFile('.migration-private/auth-private.jwk','utf8')),format:'jwk'});
  const clockResponse=await fetch('https://revystudy.vercel.app/api/verify-password?clock='+Date.now(),{cache:'no-store'});
  const timestamp=Date.parse(clockResponse.headers.get('date')||'');if(!Number.isFinite(timestamp))throw new Error('Server clock unavailable');
  const payload=JSON.stringify({mode:'configuration',expires:Math.floor(timestamp/1000)+30});
  const signature=sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64');
  const response=await fetch('https://revystudy.vercel.app/api/verify-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature})});
  const data=await response.json();if(!response.ok||!data.serviceKeyHash)throw new Error('Server configuration bridge not ready ('+response.status+'): '+String(data.error||'missing result'));
  await secret('LEGACY_ADMIN_HASH',data.serviceKeyHash);
}
