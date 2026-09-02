-- Keep deck package counts correct even when several devices or bulk imports
-- write at the same time. Recounting from concurrent transaction snapshots can
-- leave the last writer with a stale total, so use atomic deltas instead.
CREATE OR REPLACE FUNCTION public.refresh_deck_content_manifest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  count_column text;
BEGIN
  count_column := CASE TG_TABLE_NAME
    WHEN 'cards' THEN 'card_count'
    WHEN 'deck_audios' THEN 'audio_count'
    ELSE NULL
  END;

  IF count_column IS NULL THEN
    RAISE EXCEPTION 'Unsupported manifest source table: %', TG_TABLE_NAME;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF count_column = 'card_count' THEN
      UPDATE public.decks
      SET content_updated_at = now(), card_count = card_count + 1
      WHERE id = NEW.deck_id;
    ELSE
      UPDATE public.decks
      SET content_updated_at = now(), audio_count = audio_count + 1
      WHERE id = NEW.deck_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF count_column = 'card_count' THEN
      UPDATE public.decks
      SET content_updated_at = now(), card_count = GREATEST(0, card_count - 1)
      WHERE id = OLD.deck_id;
    ELSE
      UPDATE public.decks
      SET content_updated_at = now(), audio_count = GREATEST(0, audio_count - 1)
      WHERE id = OLD.deck_id;
    END IF;
  ELSIF OLD.deck_id IS DISTINCT FROM NEW.deck_id THEN
    IF count_column = 'card_count' THEN
      UPDATE public.decks
      SET content_updated_at = now(), card_count = GREATEST(0, card_count - 1)
      WHERE id = OLD.deck_id;
      UPDATE public.decks
      SET content_updated_at = now(), card_count = card_count + 1
      WHERE id = NEW.deck_id;
    ELSE
      UPDATE public.decks
      SET content_updated_at = now(), audio_count = GREATEST(0, audio_count - 1)
      WHERE id = OLD.deck_id;
      UPDATE public.decks
      SET content_updated_at = now(), audio_count = audio_count + 1
      WHERE id = NEW.deck_id;
    END IF;
  ELSE
    UPDATE public.decks
    SET content_updated_at = now()
    WHERE id = NEW.deck_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_deck_content_manifest() FROM PUBLIC, anon, authenticated;

-- Repair totals that may have been left stale by concurrent writes before the
-- atomic trigger was installed.
UPDATE public.decks d
SET card_count = (SELECT count(*)::integer FROM public.cards c WHERE c.deck_id = d.id),
    audio_count = (SELECT count(*)::integer FROM public.deck_audios a WHERE a.deck_id = d.id),
    content_updated_at = now();
