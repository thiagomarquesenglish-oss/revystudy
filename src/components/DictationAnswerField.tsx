import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function DictationAnswerField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2 rounded-xl border border-border p-4">
    <Label htmlFor="dictation-answer">Frase correta para o ditado (opcional)</Label>
    <Textarea id="dictation-answer" value={value} onChange={event => onChange(event.target.value)}
      placeholder="Ex.: I'm hungry" rows={2} maxLength={500} lang="en" spellCheck={false}
      aria-describedby="dictation-answer-help" />
    <p id="dictation-answer-help" className="text-xs leading-relaxed text-muted-foreground">
      Escreva a frase em inglês falada no áudio deste cartão. No modo Ouvir e escrever,
      você ouve o áudio, digita e confere a frase em inglês. Deixe vazio para não incluir no ditado.
    </p>
  </div>;
}
