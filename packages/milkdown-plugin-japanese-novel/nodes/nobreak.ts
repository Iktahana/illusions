/**
 * No-break (改行抑止) node: prevents line breaks in proper nouns.
 */

import { $nodeSchema } from '@milkdown/utils'

export const nobreakSchema = $nodeSchema('nobreak', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    text: { default: '', validate: (v: unknown) => typeof v === 'string' },
  },
  parseDOM: [
    {
      tag: 'span.mdi-nobr',
      getAttrs: (dom) =>
        dom instanceof HTMLElement
          ? { text: dom.textContent ?? '' }
          : {},
    },
  ],
  toDOM: (node) => ['span', { class: 'mdi-nobr' }, node.attrs.text],
  parseMarkdown: {
    match: (node) => (node as { type?: string }).type === 'nobreak',
    runner: (state, node, type) => {
      const text = (node as { text?: string }).text ?? ''
      state.addNode(type, { text })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'nobreak',
    runner: (state, node) => {
      const text = node.attrs.text as string
      state.addNode('text', undefined, `[[no-break:${text}]]`)
    },
  },
}))
