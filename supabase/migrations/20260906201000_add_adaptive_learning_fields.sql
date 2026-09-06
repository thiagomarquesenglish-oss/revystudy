ALTER TABLE public.review_history
  ADD COLUMN IF NOT EXISTS skill TEXT,
  ADD COLUMN IF NOT EXISTS exercise_mode TEXT;

ALTER TABLE public.review_history
  DROP CONSTRAINT IF EXISTS review_history_skill_check,
  ADD CONSTRAINT review_history_skill_check
    CHECK (skill IS NULL OR skill IN ('comprehension', 'listening', 'production', 'writing')),
  DROP CONSTRAINT IF EXISTS review_history_exercise_mode_check,
  ADD CONSTRAINT review_history_exercise_mode_check
    CHECK (exercise_mode IS NULL OR exercise_mode IN (
      'image-production', 'audio-comprehension', 'text-comprehension',
      'image-audio', 'translation-production', 'audio-dictation'
    ));

CREATE INDEX IF NOT EXISTS idx_review_history_card_skill
  ON public.review_history(card_id, skill, reviewed_at DESC);
