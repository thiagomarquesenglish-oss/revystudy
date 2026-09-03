BEGIN;

ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS dictation_answer text;

-- Answer edits must also invalidate downloaded deck packages.
CREATE OR REPLACE TRIGGER refresh_deck_manifest_from_cards
AFTER INSERT OR DELETE OR UPDATE OF front, back, audio_id, card_type, deck_id, dictation_answer ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.refresh_deck_content_manifest();

COMMIT;
