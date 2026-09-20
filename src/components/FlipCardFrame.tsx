import type { ReactNode } from 'react';

export default function FlipCardFrame({ flipped, onFlip, disabled = false, children }: {
  flipped: boolean; onFlip: () => void; disabled?: boolean; children: ReactNode;
}) {
  return <div className={`study-flip-card mt-5 ${flipped ? 'is-flipped' : ''}`}
    role="button" tabIndex={disabled ? -1 : 0}
    aria-label={flipped ? 'Mostrar frente do cartão' : 'Mostrar verso do cartão'}
    onClick={event => {
      if (!disabled && !(event.target as HTMLElement).closest('button, input, textarea, audio, a, summary, [role="dialog"]')) onFlip();
    }}
    onKeyDown={event => {
      if (!disabled && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); onFlip();
      }
    }}>
    <div className="study-flip-inner">{children}</div>
  </div>;
}
