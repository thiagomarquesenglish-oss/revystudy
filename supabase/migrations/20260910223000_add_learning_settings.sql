CREATE TABLE IF NOT EXISTS public.learning_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  manual_stage INTEGER NOT NULL DEFAULT 1 CHECK (manual_stage BETWEEN 1 AND 30),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'learning_settings'
      AND policyname = 'Users manage their own learning settings'
  ) THEN
    CREATE POLICY "Users manage their own learning settings"
    ON public.learning_settings FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
