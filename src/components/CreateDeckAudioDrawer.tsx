import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

interface CreateDeckAudioDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  onCreated: () => void;
}

export default function CreateDeckAudioDrawer({ open, onOpenChange, deckId, onCreated }: CreateDeckAudioDrawerProps) {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !file) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const ext = file.name.split('.').pop() || 'mp3';
      const filePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('deck-audios')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('deck_audios')
        .insert({
          deck_id: deckId,
          user_id: user.id,
          name: name.trim(),
          file_path: filePath,
        });
      if (insertError) throw insertError;

      toast.success('Reprodução criada!');
      setName('');
      setFile(null);
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao criar reprodução');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display">Adicionar áudio</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              placeholder="Ex: Listening Exercise 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Arquivo de áudio</Label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Upload className="w-4 h-4" />
              {file ? file.name : 'Selecionar arquivo de áudio'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </div>
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={!name.trim() || !file || saving}
          >
            {saving ? 'Salvando...' : 'Adicionar áudio'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
