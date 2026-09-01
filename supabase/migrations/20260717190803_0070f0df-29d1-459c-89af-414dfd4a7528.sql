ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS card_type text NOT NULL DEFAULT 'standard';
ALTER TABLE public.cards ADD CONSTRAINT cards_card_type_check CHECK (card_type IN ('standard','typing'));