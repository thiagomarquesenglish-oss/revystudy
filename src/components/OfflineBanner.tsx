import { useOnlineStatus } from '@/hooks/useOnlineStatus';
// Keep the sync lifecycle active without showing transient status banners.
export default function OfflineBanner() { useOnlineStatus(); return null; }
