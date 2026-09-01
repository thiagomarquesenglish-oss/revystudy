import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';

interface CreateDeckDialogProps {
  onCreateDeck: (name: string, description: string) => void;
}

export default function CreateDeckDialog({ onCreateDeck }: CreateDeckDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreateDeck(name.trim(), description.trim());
    setName('');
    setDescription('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Baralho
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Criar Baralho</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <Input
            placeholder="Nome do baralho (ex: Inglês - Vocabulário)"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            className="border-none bg-card"
          />
          <Textarea
            placeholder="Descrição (opcional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="border-none bg-card resize-none"
          />
          <Button type="submit" disabled={!name.trim()}>Criar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
