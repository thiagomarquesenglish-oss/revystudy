import { ReactNode, useEffect, useState } from 'react';
import { imagesReady, prepareHtml } from '@/lib/study-media';

/** Reveal a side together, after its images are decoded, before mounting autoplay. */
export default function StudyMedia({ html, children }: { html: string; children: ReactNode }) {
  const [readyHtml, setReadyHtml] = useState<string | null>(() => imagesReady(html) ? html : null);
  useEffect(() => {
    let active = true;
    void prepareHtml(html).then(() => { if (active) setReadyHtml(html); });
    return () => { active = false; };
  }, [html]);
  if (readyHtml !== html && !imagesReady(html)) {
    return <div role="status" aria-label="Preparando cartão" className="w-full min-h-64 rounded-xl bg-muted/20" />;
  }
  return <>{children}</>;
}
