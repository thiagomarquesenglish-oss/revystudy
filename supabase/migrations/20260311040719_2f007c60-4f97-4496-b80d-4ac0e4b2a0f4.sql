
-- Create deck_audios table
CREATE TABLE public.deck_audios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deck_audios ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own deck audios"
  ON public.deck_audios FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own deck audios"
  ON public.deck_audios FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deck audios"
  ON public.deck_audios FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create storage bucket for deck audios
INSERT INTO storage.buckets (id, name, public)
VALUES ('deck-audios', 'deck-audios', true);

-- Storage RLS policies
CREATE POLICY "Users can upload their own deck audios"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'deck-audios' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view deck audios"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'deck-audios');

CREATE POLICY "Users can delete their own deck audios"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'deck-audios' AND (storage.foldername(name))[1] = auth.uid()::text);
