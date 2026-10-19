import { passwordBridge } from '../server/password-bridge.js';
import publicJwk from '../server/migration-auth-public.json' with { type: 'json' };

// Stateless internal bridge: no account lookup, credentials stored or sessions minted here.
// Only the Worker holding the private key can authorize this CPU-intensive operation.
export default passwordBridge(publicJwk);
