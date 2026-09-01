DROP TRIGGER IF EXISTS refresh_deck_manifest_from_cards ON public.cards;
CREATE TRIGGER refresh_deck_manifest_from_cards
AFTER INSERT OR DELETE OR UPDATE OF front, back, audio_id, card_type, deck_id ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.refresh_deck_content_manifest();