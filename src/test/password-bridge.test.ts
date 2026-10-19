import { expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { hash } from 'bcryptjs';
import { passwordBridge } from '../../server/password-bridge.js';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const handler=passwordBridge(pair.publicKey.export({format:'jwk'}),()=> 'test-service-key');
async function invoke(value:any,alter=false) {
  const payload=JSON.stringify(value),signature=sign('RSA-SHA256',Buffer.from(payload),pair.privateKey).toString('base64');
  const response:any={statusCode:200,body:null,setHeader(){},status(code:number){this.statusCode=code;return this;},json(body:any){this.body=body;return this;}};
  await handler({method:'POST',body:{payload:alter?payload+' ':payload,signature}},response);return response;
}
it('accepts existing bcrypt passwords only in a valid Worker-signed envelope',async()=>{
  const value={password:'test-only-password',hash:await hash('test-only-password',4),expires:Math.floor(Date.now()/1000)+30};
  expect((await invoke(value)).body).toEqual({valid:true});
  expect((await invoke({...value,password:'wrong'})).body).toEqual({valid:false});
  expect((await invoke(value,true)).statusCode).toBe(401);
  expect((await invoke({...value,expires:1})).statusCode).toBe(400);
});
it('does not expose the legacy service key, only its digest to the signed caller',async()=>{
  const response=await invoke({mode:'configuration',expires:Math.floor(Date.now()/1000)+30});
  expect(response.statusCode).toBe(200);expect(response.body.serviceKeyHash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(response.body)).not.toContain('test-service-key');
});
