ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS cards_flagged_idx ON public.cards (user_id, flagged) WHERE flagged = true;