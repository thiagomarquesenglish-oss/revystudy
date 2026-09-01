ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS content_updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS card_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audio_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.refresh_deck_content_manifest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

DROP TRIGGER IF EXISTS refresh_deck_manifest_from_cards ON public.cards;
CREATE TRIGGER refresh_deck_manifest_from_cards
AFTER INSERT OR UPDATE OR DELETE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.refresh_deck_content_manifest();

DROP TRIGGER IF EXISTS refresh_deck_manifest_from_audios ON public.deck_audios;
CREATE TRIGGER refresh_deck_manifest_from_audios
AFTER INSERT OR UPDATE OR DELETE ON public.deck_audios
FOR EACH ROW EXECUTE FUNCTION public.refresh_deck_content_manifest();

UPDATE public.decks d
SET content_updated_at = GREATEST(
      d.created_at,
      COALESCE((SELECT max(c.updated_at) FROM public.cards c WHERE c.deck_id = d.id), d.created_at),
      COALESCE((SELECT max(a.created_at) FROM public.deck_audios a WHERE a.deck_id = d.id), d.created_at)
    ),
    card_count = (SELECT count(*)::integer FROM public.cards c WHERE c.deck_id = d.id),
    audio_count = (SELECT count(*)::integer FROM public.deck_audios a WHERE a.deck_id = d.id);