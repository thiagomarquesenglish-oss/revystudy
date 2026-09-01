CREATE OR REPLACE FUNCTION public.refresh_deck_content_manifest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_deck_id uuid;
BEGIN
  target_deck_id := COALESCE(NEW.deck_id, OLD.deck_id);

  UPDATE public.decks
  SET content_updated_at = now(),
      card_count = (SELECT count(*)::integer FROM public.cards WHERE deck_id = target_deck_id),
      audio_count = (SELECT count(*)::integer FROM public.deck_audios WHERE deck_id = target_deck_id)
  WHERE id = target_deck_id;

  IF TG_OP = 'UPDATE' AND OLD.deck_id IS DISTINCT FROM NEW.deck_id THEN
    UPDATE public.decks
    SET content_updated_at = now(),
        card_count = (SELECT count(*)::integer FROM public.cards WHERE deck_id = OLD.deck_id),
        audio_count = (SELECT count(*)::integer FROM public.deck_audios WHERE deck_id = OLD.deck_id)
    WHERE id = OLD.deck_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_deck_content_manifest() FROM PUBLIC, anon, authenticated;