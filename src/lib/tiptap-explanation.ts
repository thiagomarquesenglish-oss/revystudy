import { Node, mergeAttributes } from '@tiptap/core';

export interface ExplanationOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    explanation: {
      toggleExplanation: () => ReturnType;
    };
  }
}

const ExplanationNode = Node.create<ExplanationOptions>({
  name: 'explanation',
  group: 'block',
  content: 'block+',
  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-explanation]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-explanation': 'true',
        class: 'explanation-block',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleExplanation:
        () =>
        ({ commands, state }) => {
          const { from, to } = state.selection;
          let isInExplanation = false;
          state.doc.nodesBetween(from, to, (node) => {
            if (node.type.name === 'explanation') {
              isInExplanation = true;
            }
          });

          if (isInExplanation) {
            return commands.lift('explanation');
          }

          return commands.wrapIn('explanation');
        },
    };
  },
});

export default ExplanationNode;
