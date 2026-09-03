import { useState, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ImagePlus,
  Volume2,
  Maximize,
  ChevronDown,
  ChevronUp,
  MessageSquareText,
  Minus,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6',
  '#ec4899', '#f43f5e', '#a855f7', '#06b6d4',
  '#10b981', '#84cc16', '#00aaff', '#ffffff',
  '#6b7280', '#000000',
];

const IMAGE_SIZES = [
  { label: 'Pequena', width: '35%' },
  { label: 'Média', width: '65%' },
  { label: 'Grande', width: '150%' },
];

interface EditorToolbarProps {
  editor: Editor | null;
}

export default function EditorToolbar({ editor }: EditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [selectedColor, setSelectedColor] = useState('#3b82f6');
  const [colorOpen, setColorOpen] = useState(false);
  const [customHex, setCustomHex] = useState('');

  if (!editor) return null;

  const imageSelected = editor.isActive('image');

  const handleImageUpload = () => fileInputRef.current?.click();
  const handleAudioUpload = () => audioInputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result as string }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const onAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setAudio({ src: reader.result as string, filename: file.name }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleImageResize = (width: string) => {
    const { state } = editor;
    const { from, to } = state.selection;
    state.doc.nodesBetween(from, to, (node) => {
      if (node.type.name === 'image') {
        editor.chain().focus().setImage({
          src: node.attrs.src,
          alt: node.attrs.alt,
          title: node.attrs.title,
          width,
        } as any).run();
      }
    });
  };

  const ToolbarButton = ({
    active,
    onClick,
    children,
    title,
    disabled,
  }: {
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title: string;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded-md transition-colors ${
        disabled
          ? 'text-muted-foreground/30 cursor-not-allowed'
          : active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
      }`}
    >
      {children}
    </button>
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={handleImageUpload} className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-3 text-sm font-medium hover:bg-secondary"><ImagePlus className="w-4 h-4" />Adicionar imagem</button>
        <button type="button" onClick={handleAudioUpload} className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-3 text-sm font-medium hover:bg-secondary"><Volume2 className="w-4 h-4" />Adicionar áudio</button>
      </div>
      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-muted-foreground">Formatação avançada</summary>
      <div className="flex flex-wrap items-center gap-0.5 px-2 pb-2">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Negrito"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Itálico"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Sublinhado"
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Color picker */}
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={() => editor.chain().focus().setColor(selectedColor).run()}
            title="Aplicar cor"
            className="flex items-center gap-1 p-1.5 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            <span className="text-xs font-bold leading-none">A</span>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedColor }} />
          </button>
          <button
            type="button"
            onClick={() => setColorOpen(prev => !prev)}
            title="Escolher cor"
            className="p-0.5 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            {colorOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <div
            className="absolute top-full left-0 mt-1 rounded-lg shadow-lg z-20 transition-opacity duration-150 ease-out bg-[#1a1a1a] border border-border/50"
            style={{
              opacity: colorOpen ? 1 : 0,
              pointerEvents: colorOpen ? 'auto' : 'none',
            }}
          >
            <div className="p-2.5 grid grid-cols-4 gap-1.5 min-w-[150px]">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    setSelectedColor(color);
                    editor.chain().focus().setColor(color).run();
                    setColorOpen(false);
                  }}
                  className={`w-6 h-6 rounded-full border-2 hover:scale-110 transition-transform ${
                    selectedColor === color ? 'border-primary ring-1 ring-primary' : 'border-[#333]'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <div className="px-2.5 pb-2 flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">#</span>
              <input
                type="text"
                value={customHex}
                onChange={(e) => setCustomHex(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && /^[0-9a-fA-F]{3,6}$/.test(customHex)) {
                    const hex = `#${customHex}`;
                    setSelectedColor(hex);
                    editor.chain().focus().setColor(hex).run();
                    setColorOpen(false);
                    setCustomHex('');
                  }
                }}
                placeholder="00aaff"
                className="flex-1 bg-[#111] text-xs text-foreground px-2 py-1 rounded border border-[#333] outline-none focus:border-primary/50 w-0"
              />
              <button
                type="button"
                disabled={!/^[0-9a-fA-F]{3,6}$/.test(customHex)}
                onClick={() => {
                  const hex = `#${customHex}`;
                  setSelectedColor(hex);
                  editor.chain().focus().setColor(hex).run();
                  setColorOpen(false);
                  setCustomHex('');
                }}
                className="text-xs px-1.5 py-1 rounded bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                OK
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setColorOpen(false);
              }}
              className="w-full text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 px-2.5 py-1.5 border-t border-[#333]"
            >
              Remover cor
            </button>
          </div>
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Lista"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Lista numerada"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          title="Alinhar à esquerda"
        >
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          title="Centralizar"
        >
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          title="Alinhar à direita"
        >
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton
          onClick={handleImageUpload}
          title="Inserir imagem"
        >
          <ImagePlus className="w-4 h-4" />
        </ToolbarButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={!imageSelected}>
            <button
              type="button"
              title="Tamanho da imagem"
              className={`p-1.5 rounded-md transition-colors ${
                imageSelected
                  ? 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  : 'text-muted-foreground/30 cursor-not-allowed'
              }`}
            >
              <Maximize className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          {imageSelected && (
            <DropdownMenuContent align="start">
              {IMAGE_SIZES.map((size) => (
                <DropdownMenuItem key={size.width} onClick={() => handleImageResize(size.width)}>
                  {size.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>

        <ToolbarButton
          onClick={handleAudioUpload}
          title="Inserir áudio"
        >
          <Volume2 className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('explanation')}
          onClick={() => editor.chain().focus().toggleExplanation().run()}
          title="Bloco de explicação"
        >
          <MessageSquareText className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Linha divisória"
        >
          <Minus className="w-4 h-4" />
        </ToolbarButton>
      </div></details>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
      <input ref={audioInputRef} type="file" accept="audio/*" onChange={onAudioChange} className="hidden" />
    </>
  );
}
