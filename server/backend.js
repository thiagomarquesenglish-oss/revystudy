import { createClient } from '@supabase/supabase-js';
import { CLOUD_BACKEND_URL } from '../shared/backend-config.js';
export function backendAdmin() {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw new Error('O servidor ainda não foi conectado ao banco.');
  // Keep the transport SDK, but auth/data/storage requests now go to Cloudflare.
  return createClient(CLOUD_BACKEND_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
