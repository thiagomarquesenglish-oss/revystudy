import { Node, mergeAttributes } from '@tiptap/core';

export interface AudioOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    audio: {
      setAudio: (options: { src: string; filename?: string }) => ReturnType;
    };
  }
}

const AudioNode = Node.create<AudioOptions>({
  name: 'audio',
  group: 'block',
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
      },
      filename: {
        default: 'audio.mp3',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-audio]',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          return {
            src: element.getAttribute('data-src'),
            filename: element.getAttribute('data-filename') || 'audio.mp3',
          };
        },
      },
      {
        tag: 'audio',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          const source = element.querySelector('source');
          return {
            src: source?.getAttribute('src') || element.getAttribute('src'),
            filename: element.getAttribute('data-filename') || 'audio.mp3',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const filename = HTMLAttributes.filename || 'audio.mp3';
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, {
        'data-audio': 'true',
        'data-src': HTMLAttributes.src,
        'data-filename': filename,
        class: 'audio-node',
      }),
      ['span', { class: 'audio-node-icon' }, '🔊'],
      ['span', { class: 'audio-node-name' }, filename],
      ['audio', { src: HTMLAttributes.src, preload: 'none', class: 'audio-node-element' }],
    ];
  },

  addCommands() {
    return {
      setAudio:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

export default AudioNode;
