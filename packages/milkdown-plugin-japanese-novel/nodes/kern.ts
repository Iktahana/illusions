/**
 * Kerning (字間調整) node: adjusts letter spacing.
 */

import { $nodeSchema } from '@milkdown/utils'

export const kernSchema = $nodeSchema('kern', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    amount: { default: '0em', validate: (v: unknown) => typeof v === 'string' },
    text: { default: '', validate: (v: unknown) => typeof v === 'string' },
  },
  parseDOM: [
    {
      tag: 'span.mdi-kern',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return {}
        const style = dom.style.getPropertyValue('--mdi-kern')
        return {
          amount: style || '0em',
          text: dom.textContent ?? '',
        }
      },
    },
  ],
  toDOM: (node) => [
    'span',
    {
      class: 'mdi-kern',
      style: `--mdi-kern:${node.attrs.amount};`,
    },
    node.attrs.text,
  ],
  parseMarkdown: {
    match: (node) => (node as { type?: string }).type === 'kern',
    runner: (state, node, type) => {
      const n = node as { amount?: string; text?: string }
      state.addNode(type, {
        amount: n.amount ?? '0em',
        text: n.text ?? '',
      })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'kern',
    runner: (state, node) => {
      const amount = node.attrs.amount as string
      const text = node.attrs.text as string
      state.addNode('text', undefined, `[[kern:${amount}:${text}]]`)
    },
  },
}))
