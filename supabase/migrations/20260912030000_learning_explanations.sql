CREATE TABLE IF NOT EXISTS public.learning_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concept_key TEXT NOT NULL,
  selected_text TEXT NOT NULL,
  sentence TEXT NOT NULL,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  quick_meaning TEXT NOT NULL DEFAULT '',
  card_front TEXT NOT NULL,
  card_back TEXT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS learning_explanations_user_context_idx
  ON public.learning_explanations (user_id, sentence, selected_text);
CREATE INDEX IF NOT EXISTS learning_explanations_user_selection_idx
  ON public.learning_explanations (user_id, lower(selected_text));

ALTER TABLE public.learning_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own learning explanations"
  ON public.learning_explanations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
