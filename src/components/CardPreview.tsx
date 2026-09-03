import { useMemo, useState } from 'react';
import { sanitizeImportedHtml } from '@/lib/deck-io';
import { Button } from '@/components/ui/button';

export default function CardPreview({ front, back }: { front: string; back: string }) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const html = useMemo(() => sanitizeImportedHtml(side === 'front' ? front : back), [side, front, back]);
  return <details className="rounded-2xl border border-border bg-card p-4">
    <summary className="cursor-pointer font-semibold">Prévia do cartão</summary>
    <div className="mt-4 space-y-4">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={side === 'front' ? 'default' : 'secondary'} onClick={() => setSide('front')}>Frente</Button>
        <Button type="button" size="sm" variant={side === 'back' ? 'default' : 'secondary'} onClick={() => setSide('back')}>Resposta</Button>
      </div>
      {html.replace(/<[^>]*>/g, '').trim() || /<(img|audio)\b/.test(html)
        ? <div className="rich-text-render min-h-24 overflow-hidden [&_img]:max-w-full [&_audio]:w-full" dangerouslySetInnerHTML={{ __html: html }} />
        : <p className="text-sm text-muted-foreground">O conteúdo que você adicionar aparecerá aqui.</p>}
    </div>
  </details>;
}
