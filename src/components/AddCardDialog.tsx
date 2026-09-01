import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

interface AddCardDialogProps {
  onAddCard: (front: string, back: string) => void;
}

export default function AddCardDialog({ onAddCard }: AddCardDialogProps) {
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    onAddCard(front.trim(), back.trim());
    setFront('');
    setBack('');
    // keep dialog open for rapid card creation
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Plus className="w-4 h-4" />
          Adicionar Cartão
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Novo Cartão</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Frente (pergunta)</label>
            <Input
              placeholder="Ex: What does 'serendipity' mean?"
              value={front}
              onChange={e => setFront(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Verso (resposta)</label>
            <Input
              placeholder="Ex: A happy accident or pleasant surprise"
              value={back}
              onChange={e => setBack(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={!front.trim() || !back.trim()}>
            Adicionar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

