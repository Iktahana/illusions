/**
 * Tate-chu-yoko (縦中横) node: horizontal digits/punctuation in vertical writing.
 */

import { $nodeSchema } from '@milkdown/utils'

export const tcySchema = $nodeSchema('tcy', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    value: { default: '', validate: (v: unknown) => typeof v === 'string' },
  },
  parseDOM: [
    {
      tag: 'span.tcy',
      getAttrs: (dom) =>
        dom instanceof HTMLElement
          ? { value: dom.textContent ?? '' }
          : {},
    },
  ],
  toDOM: (node) => ['span', { class: 'tcy' }, node.attrs.value],
  parseMarkdown: {
    match: (node) => (node as { type?: string }).type === 'tcy',
    runner: (state, node, type) => {
      const v = (node as { value?: string }).value ?? ''
      state.addNode(type, { value: v })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'tcy',
    runner: (state, node) => {
      state.addNode('text', undefined, node.attrs.value as string)
    },
  },
}))
