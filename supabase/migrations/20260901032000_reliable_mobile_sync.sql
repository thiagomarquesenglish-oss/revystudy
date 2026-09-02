-- Separate study progress from content changes so downloading content on a
-- phone never overwrites a newer local review state.
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS progress_updated_at timestamp with time zone;

UPDATE public.cards
SET progress_updated_at = COALESCE(progress_updated_at, updated_at, created_at)
WHERE progress_updated_at IS NULL;

ALTER TABLE public.cards
  ALTER COLUMN progress_updated_at SET DEFAULT now(),
  ALTER COLUMN progress_updated_at SET NOT NULL;

-- Renaming a deck or changing its description is also a content update that
-- must be offered to other devices.
CREATE OR REPLACE FUNCTION public.touch_deck_metadata_manifest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name OR OLD.description IS DISTINCT FROM NEW.description THEN
    NEW.content_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_deck_metadata_manifest ON public.decks;
CREATE TRIGGER touch_deck_metadata_manifest
BEFORE UPDATE OF name, description ON public.decks
FOR EACH ROW EXECUTE FUNCTION public.touch_deck_metadata_manifest();

REVOKE ALL ON FUNCTION public.touch_deck_metadata_manifest() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_cards_progress_updated_at
  ON public.cards(progress_updated_at);
