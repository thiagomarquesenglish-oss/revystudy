import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCardById, updateCard, deleteCard, getDeckAudios } from '@/lib/storage';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import RichTextEditor from '@/components/RichTextEditor';
import EditorToolbar from '@/components/EditorToolbar';
import PageHeader from '@/components/PageHeader';
import DictationAnswerField from '@/components/DictationAnswerField';
import CardPreview from '@/components/CardPreview';
import { toast } from 'sonner';
import type { Editor } from '@tiptap/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function EditCardPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [dictationAnswer, setDictationAnswer] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [frontEditor, setFrontEditor] = useState<Editor | null>(null);
  const [backEditor, setBackEditor] = useState<Editor | null>(null);
  const [audios, setAudios] = useState<{ id: string; name: string }[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>('none');
  const [hasAudios, setHasAudios] = useState(false);
  const ready = front !== null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const card = await getCardById(cardId!);
      if (cancelled) return;
      if (card) {
        const deckAudios = await getDeckAudios(card.deckId);
        if (cancelled) return;
        const mapped = deckAudios.map(a => ({ id: a.id, name: a.name }));
        // Batch all state updates together — single render, no flicker
        setAudios(mapped);
        setHasAudios(mapped.length > 0);
        setSelectedAudioId(card.audioId || 'none');
        setFront(card.front);
        setBack(card.back);
        setDictationAnswer(card.dictationAnswer || '');
      } else {
        navigate(-1);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [cardId, navigate]);

  const handleSave = async () => {
    if (cardId) {
      setSaving(true);
      try {
        await updateCard(cardId, { front, back, dictationAnswer: dictationAnswer.trim() || null, audioId: selectedAudioId === 'none' ? null : selectedAudioId } as any);
        navigate(-1);
      } catch (err) {
        toast.error('Erro ao salvar');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleDelete = async () => {
    if (cardId) {
      try {
      await deleteCard(cardId);
      toast.success('Cartão excluído');
      navigate(-1);
      } catch { toast.error('Não foi possível excluir o cartão. Tente novamente.'); }
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
      <PageHeader
        title="Editar Cartão"
        onBack={() => navigate(-1)}
        rightContent={
          <button onClick={() => setShowDelete(true)} className="text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-5 h-5" />
          </button>
        }
      />
      <main className="max-w-3xl mx-auto px-3 space-y-4" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
        <p className="text-sm text-muted-foreground">Atualize o texto ou use os botões abaixo para adicionar mídia.</p>
        <EditorToolbar editor={activeEditor} />

        <div className="space-y-4" style={{ visibility: ready ? 'visible' : 'hidden' }}>
          <div className="space-y-2">
            <Label>Frente</Label>
            {ready && (
              <RichTextEditor
                content={front}
                onChange={v => setFront(v)}
                placeholder="Pergunta ou termo"
                onEditorReady={handleFrontReady}
                onFocus={() => frontEditor && setActiveEditor(frontEditor)}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Verso</Label>
            {ready && (
              <RichTextEditor
                content={back!}
                onChange={v => setBack(v)}
                placeholder="Resposta ou definição"
                onEditorReady={handleBackReady}
                onFocus={() => backEditor && setActiveEditor(backEditor)}
              />
            )}
          </div>

          <DictationAnswerField value={dictationAnswer} onChange={setDictationAnswer} />
          <CardPreview front={front || ''} back={back || ''} />

          {hasAudios && (
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
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-3xl mx-auto px-3 py-3">
          <Button onClick={handleSave} className="w-full" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cartão</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir este cartão? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
