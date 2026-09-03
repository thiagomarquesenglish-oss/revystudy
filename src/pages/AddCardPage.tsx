import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { addCard, getDeckAudios } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import RichTextEditor from '@/components/RichTextEditor';
import EditorToolbar from '@/components/EditorToolbar';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import DictationAnswerField from '@/components/DictationAnswerField';
import type { Editor } from '@tiptap/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DeckAudio {
  id: string;
  name: string;
}

export default function AddCardPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cardType: 'standard' | 'typing' = searchParams.get('type') === 'typing' ? 'typing' : 'standard';
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [dictationAnswer, setDictationAnswer] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const [key, setKey] = useState(0);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [frontEditor, setFrontEditor] = useState<Editor | null>(null);
  const [backEditor, setBackEditor] = useState<Editor | null>(null);
  const [audios, setAudios] = useState<DeckAudio[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>('none');

  useEffect(() => {
    async function loadAudios() {
      const deckAudios = await getDeckAudios(deckId!);
      setAudios(deckAudios.map(a => ({ id: a.id, name: a.name })));
    }
    loadAudios();
  }, [deckId]);

  const isEmpty = (html: string) => {
    if (html.includes('<img') || html.includes('<audio')) return false;
    const text = html.replace(/<[^>]*>/g, '').trim();
    return text.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmpty(front) || isEmpty(back)) return;
    try {
      await addCard(deckId!, front, back, selectedAudioId === 'none' ? null : selectedAudioId, cardType, dictationAnswer);
      setAddedCount(c => c + 1);
      setFront('');
      setBack('');
      setDictationAnswer('');
      setKey(k => k + 1);
    } catch (err) {
      toast.error('Erro ao adicionar cartão');
    }
  };

  const handleFrontReady = useCallback((editor: Editor) => {
    setFrontEditor(editor);
    setActiveEditor(editor);
  }, []);

  const handleBackReady = useCallback((editor: Editor) => {
    setBackEditor(editor);
  }, []);

  return (
    <div className="min-h-screen bg-background" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      <PageHeader title={cardType === 'typing' ? 'Novo Cartão (Digitar)' : 'Novo Cartão'} onBack={() => navigate(`/deck/${deckId}`)} />
      <main className="max-w-3xl mx-auto px-3 space-y-4" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
        <EditorToolbar editor={activeEditor} />

        <form id="add-card-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{cardType === 'typing' ? 'Frente (pergunta)' : 'Frente'}</Label>
            <RichTextEditor
              key={`front-${key}`}
              content=""
              onChange={setFront}
              placeholder={cardType === 'typing' ? 'Ex: Olá, tudo bem?' : 'Pergunta ou termo'}
              autoFocus
              onEditorReady={handleFrontReady}
              onFocus={() => frontEditor && setActiveEditor(frontEditor)}
            />
          </div>
          <div className="space-y-2">
            <Label>{cardType === 'typing' ? 'Verso (resposta a digitar)' : 'Verso'}</Label>
            <RichTextEditor
              key={`back-${key}`}
              content=""
              onChange={setBack}
              placeholder={cardType === 'typing' ? 'Ex: Hello, how are you?' : 'Resposta ou definição'}
              onEditorReady={handleBackReady}
              onFocus={() => backEditor && setActiveEditor(backEditor)}
            />
            {cardType === 'typing' && (
              <p className="text-xs text-muted-foreground">
                Ao estudar, você digitará essa resposta. Comparação ignora maiúsculas, acentos e pontuação.
              </p>
            )}
          </div>

          <DictationAnswerField value={dictationAnswer} onChange={setDictationAnswer} />

          {audios.length > 0 && (
            <div className="space-y-2">
              <Label>Vincular a uma reprodução</Label>
              <Select value={selectedAudioId} onValueChange={setSelectedAudioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {audios.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {addedCount > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              {addedCount} {addedCount === 1 ? 'cartão adicionado' : 'cartões adicionados'}
            </p>
          )}
        </form>
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-3xl mx-auto px-3 py-3">
          <Button type="submit" form="add-card-form" className="w-full" disabled={isEmpty(front) || isEmpty(back)}>
            Adicionar Cartão
          </Button>
        </div>
      </div>
    </div>
  );
}
