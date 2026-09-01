import { Pin, PinOff } from 'lucide-react';

interface PinButtonProps {
  pinned: boolean;
  onToggle: () => void;
}

export default function PinButton({ pinned, onToggle }: PinButtonProps) {
  return (
    <button
      onClick={onToggle}
      className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
      title={pinned ? 'Desafixar da página inicial' : 'Fixar na página inicial'}
    >
      {pinned ? <Pin className="w-3.5 h-3.5 text-primary" /> : <PinOff className="w-3.5 h-3.5" />}
    </button>
  );
}
