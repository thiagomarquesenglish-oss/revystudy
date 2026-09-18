import { useNavigate } from 'react-router-dom';
import { useRef, useLayoutEffect } from 'react';
import SfIcon from '@/components/SfIcon';

interface PageHeaderProps {
  title: string;
  rightContent?: React.ReactNode;
  bottomContent?: React.ReactNode;
  onBack?: () => void;
}

export default function PageHeader({ title, rightContent, bottomContent, onBack }: PageHeaderProps) {
  const navigate = useNavigate();
  const goBack = () => { if (window.history.state?.idx > 0) navigate(-1); else onBack?.(); };
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const setVar = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) {
        document.documentElement.style.setProperty("--app-header-height", `${h}px`);
      }
    };
    setVar();
    const ro = new ResizeObserver(() => setVar());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header
      ref={ref}
      className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl safe-area-top"
    >
      <div className="max-w-3xl mx-auto px-3 flex items-center justify-between h-12">
        <div className="flex items-center gap-1 min-w-0">
          {onBack && (
            <button onClick={goBack} aria-label="Voltar" className="-ml-2 h-11 w-11 flex items-center justify-center text-primary">
              <SfIcon name="back" className="w-7 h-7" />
            </button>
          )}
          <h2 className="font-display font-semibold text-lg truncate">{title}</h2>
        </div>
        {rightContent && <div className="flex items-center gap-2 mr-1">{rightContent}</div>}
      </div>
      {bottomContent || <div className="w-full h-px bg-muted-foreground/15" />}
    </header>
  );
}

