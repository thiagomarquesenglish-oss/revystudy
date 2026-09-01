import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { addCard } from '@/lib/storage';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface BulkAddCardsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  onAdded: () => void;
}

export default function BulkAddCardsDrawer({ open, onOpenChange, deckId, onAdded }: BulkAddCardsDrawerProps) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = lines.map(line => {
      const sepIndex = line.indexOf(';');
      if (sepIndex === -1) return null;
      const front = line.slice(0, sepIndex).trim();
      const back = line.slice(sepIndex + 1).trim();
      if (!front || !back) return null;
      return { front, back };
    }).filter(Boolean) as { front: string; back: string }[];

    if (parsed.length === 0) {
      toast.error('Nenhum cartão válido encontrado. Use o formato: frente ; verso');
      return;
    }

    setAdding(true);
    try {
      let count = 0;
      for (const card of parsed) {
        await addCard(deckId, card.front, card.back);
        count++;
      }
      toast.success(`${count} cartões adicionados!`);
      setText('');
      onOpenChange(false);
      onAdded();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao adicionar cartões');
    } finally {
      setAdding(false);
    }
  };

  const lineCount = text.split('\n').map(l => l.trim()).filter(Boolean).length;
  const validCount = text.split('\n').map(l => l.trim()).filter(Boolean).filter(l => {
    const i = l.indexOf(';');
    return i !== -1 && l.slice(0, i).trim() && l.slice(i + 1).trim();
  }).length;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display">Adicionar em lote</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-3">
          <p className="text-xs text-muted-foreground">
            Cole os cartões no formato: <span className="font-mono text-foreground">frente ; verso</span> (um por linha)
          </p>
          <Textarea
            placeholder={"friend ; amigo\ntalk ; conversar\ncall ; ligar"}
            value={text}
            onChange={e => setText(e.target.value)}
            rows={10}
            className="font-mono text-sm"
          />
          {text.trim() && (
            <p className="text-xs text-muted-foreground">
              {validCount} de {lineCount} linhas válidas
            </p>
          )}
          <Button
            onClick={handleAdd}
            disabled={adding || validCount === 0}
            className="w-full gap-2"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {adding ? 'Adicionando...' : `Adicionar ${validCount} cartões`}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
