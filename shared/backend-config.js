export const CLOUD_BACKEND_URL = 'https://revystudy-cloud.revystudy-thiago-fc24.workers.dev';
export const LEGACY_MEDIA_ORIGIN = 'https://paomzgkwglvshrztebni.supabase.co';
export function migrateMediaReferences(value) {
  return typeof value === 'string' ? value.replaceAll(LEGACY_MEDIA_ORIGIN+'/storage/v1/',CLOUD_BACKEND_URL+'/storage/v1/') : value;
}
