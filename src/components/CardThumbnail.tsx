import { useEffect, useRef, useState } from 'react';
import { getLocalCardThumbnail } from '@/lib/storage';

export default function CardThumbnail({ cardId, alt }: { cardId: string; alt: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      void getLocalCardThumbnail(cardId).then(setSrc).catch(() => undefined);
    }, { rootMargin: '120px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [cardId]);
  return <span ref={host} className="block mb-3 h-24 rounded-xl bg-secondary overflow-hidden">
    {src ? <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      : <span className="h-full flex items-center justify-center text-xs text-muted-foreground">Cartão de inglês</span>}
  </span>;
}
