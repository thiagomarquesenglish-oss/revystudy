import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import ImageBase from '@tiptap/extension-image';
import ExplanationNode from '@/lib/tiptap-explanation';

const CustomImage = ImageBase.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width'),
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { width: attributes.width, style: `width: ${attributes.width}` };
        },
      },
    };
  },
});
import AudioNode from '@/lib/tiptap-audio';
import { useRef, useEffect, useState, useCallback } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEditorReady?: (editor: Editor) => void;
  onFocus?: () => void;
}

export default function RichTextEditor({ content, onChange, placeholder, autoFocus, onEditorReady, onFocus }: RichTextEditorProps) {
  const [dragOver, setDragOver] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      CustomImage.configure({ inline: true, allowBase64: true }),
      AudioNode,
      ExplanationNode,
    ],
    content,
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const file = files[0];
        if (file.type.startsWith('image/') || file.type.startsWith('audio/')) {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onFocus: () => {
      onFocus?.();
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (autoFocus && editor) {
      setTimeout(() => editor.commands.focus(), 100);
    }
  }, [autoFocus, editor]);

  const insertFile = useCallback((file: File) => {
    if (!editor) return;
    const reader = new FileReader();
    if (file.type.startsWith('image/')) {
      reader.onload = () => {
        editor.chain().focus().setImage({ src: reader.result as string }).run();
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('audio/')) {
      reader.onload = () => {
        editor.chain().focus().setAudio({ src: reader.result as string, filename: file.name }).run();
      };
      reader.readAsDataURL(file);
    }
  }, [editor]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    const file = files[0];
    if (file.type.startsWith('image/') || file.type.startsWith('audio/')) {
      insertFile(file);
    }
  }, [insertFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const items = e.dataTransfer?.items;
    if (items?.length) {
      const type = items[0].type;
      if (type.startsWith('image/') || type.startsWith('audio/')) {
        setDragOver(true);
      }
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  if (!editor) return null;

  return (
    <div
      className={`border rounded-xl overflow-hidden bg-card transition-colors ${
        dragOver ? 'border-primary border-dashed bg-primary/5' : 'border-border'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
