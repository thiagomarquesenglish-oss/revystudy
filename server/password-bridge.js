import { createHash, createPublicKey, verify } from 'node:crypto';
import { compare } from 'bcryptjs';

export function passwordBridge(publicJwk,serviceKey=()=>process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const publicKey=createPublicKey({key:publicJwk,format:'jwk'});
  return async function handler(request,response) {
    response.setHeader('Cache-Control','no-store');
    if(request.method!=='POST')return response.status(405).json({error:'Method not allowed'});
    const {payload,signature}=request.body||{};
    if(typeof payload!=='string'||payload.length>3000||typeof signature!=='string'||signature.length>500)return response.status(400).json({error:'Invalid request'});
    let valid=false;try{valid=verify('RSA-SHA256',Buffer.from(payload),publicKey,Buffer.from(signature,'base64'));}catch{}
    if(!valid)return response.status(401).json({error:'Unauthorized'});
    let body;try{body=JSON.parse(payload);}catch{return response.status(400).json({error:'Invalid payload'});}
    const timestamp=Math.floor(Date.now()/1000);
    if(!Number.isInteger(body.expires)||body.expires<timestamp||body.expires>timestamp+60)return response.status(400).json({error:'Expired payload'});
    if(body.mode==='configuration') {
      const key=serviceKey();if(!key)return response.status(503).json({error:'Server credentials unavailable'});
      return response.status(200).json({serviceKeyHash:createHash('sha256').update(key).digest('hex')});
    }
    if(typeof body.password!=='string'||body.password.length>256||!/^\$2[aby]\$(0[4-9]|1[0-2])\$[./A-Za-z0-9]{53}$/.test(body.hash||''))return response.status(400).json({error:'Invalid payload'});
    return response.status(200).json({valid:await compare(body.password,body.hash)});
  };
}
