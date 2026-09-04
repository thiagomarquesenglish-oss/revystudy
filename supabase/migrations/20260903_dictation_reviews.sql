CREATE TABLE IF NOT EXISTS public.dictation_reviews (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  answer text NOT NULL,
  rating text NOT NULL CHECK (rating IN ('again','hard','good','easy','legacy')),
  reviewed_at timestamptz NOT NULL,
  legacy jsonb,
  PRIMARY KEY (user_id, id)
);
ALTER TABLE public.dictation_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own dictation reviews" ON public.dictation_reviews;
CREATE POLICY "Read own dictation reviews" ON public.dictation_reviews FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Insert own dictation reviews" ON public.dictation_reviews;
CREATE POLICY "Insert own dictation reviews" ON public.dictation_reviews FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.cards c WHERE c.id = card_id AND c.deck_id = dictation_reviews.deck_id AND c.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Delete own dictation reviews" ON public.dictation_reviews;
CREATE POLICY "Delete own dictation reviews" ON public.dictation_reviews FOR DELETE TO authenticated USING (auth.uid() = user_id);
GRANT SELECT, INSERT, DELETE ON public.dictation_reviews TO authenticated;
CREATE INDEX IF NOT EXISTS dictation_reviews_owner_date ON public.dictation_reviews(user_id, reviewed_at);
