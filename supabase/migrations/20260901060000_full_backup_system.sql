CREATE TABLE IF NOT EXISTS public.backup_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  email text NOT NULL,
  weekday smallint NOT NULL DEFAULT 0 CHECK (weekday BETWEEN 0 AND 6),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  retention_count smallint NOT NULL DEFAULT 4 CHECK (retention_count BETWEEN 1 AND 12),
  include_media boolean NOT NULL DEFAULT true,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_backup_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own backup settings" ON public.backup_settings;
CREATE POLICY "Users can view their own backup settings"
ON public.backup_settings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own backup settings" ON public.backup_settings;
CREATE POLICY "Users can create their own backup settings"
ON public.backup_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own backup settings" ON public.backup_settings;
CREATE POLICY "Users can update their own backup settings"
ON public.backup_settings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_backup_settings_updated_at ON public.backup_settings;
CREATE TRIGGER update_backup_settings_updated_at
BEFORE UPDATE ON public.backup_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  storage_path text,
  size_bytes bigint,
  emailed_to text,
  error_message text,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own backup runs" ON public.backup_runs;
CREATE POLICY "Users can view their own backup runs"
ON public.backup_runs FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_backup_runs_user_created
ON public.backup_runs(user_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('user-backups', 'user-backups', false, 104857600)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 104857600;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('card-media', 'card-media', true, 26214400)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 26214400;

DROP POLICY IF EXISTS "Users can read their own backups" ON storage.objects;
CREATE POLICY "Users can read their own backups"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'user-backups' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can manage their own card media" ON storage.objects;
CREATE POLICY "Users can manage their own card media"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'card-media' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'card-media' AND (storage.foldername(name))[1] = auth.uid()::text);
