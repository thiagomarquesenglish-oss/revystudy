import fs from 'node:fs/promises';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
const directory='.migration-private';await fs.mkdir(directory,{recursive:true});
try { await fs.access(directory+'/auth-private.jwk'); }
catch {
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  await fs.writeFile(directory+'/auth-private.jwk',JSON.stringify(privateKey.export({format:'jwk'})),{mode:0o600});
  await fs.writeFile('server/migration-auth-public.json',JSON.stringify(publicKey.export({format:'jwk'})));
  await fs.writeFile(directory+'/admin-key',randomBytes(32).toString('hex'),{mode:0o600});
}
console.log('Migration keys prepared. Private keys remain outside Git.');
