/**
 * Ruby (振仮名) node: <ruby><rb>base</rb><rt>ruby</rt></ruby>
 */

import { $nodeSchema } from '@milkdown/utils'

export const rubySchema = $nodeSchema('ruby', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    base: { default: '', validate: (v: unknown) => typeof v === 'string' },
    text: { default: '', validate: (v: unknown) => typeof v === 'string' },
  },
  parseDOM: [
    {
      tag: 'ruby',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return {}
        const rb = dom.querySelector('rb')
        const rt = dom.querySelector('rt')
        return {
          base: rb?.textContent ?? '',
          text: rt?.textContent ?? '',
        }
      },
    },
  ],
  toDOM: (node) => [
    'ruby',
    {},
    ['rb', {}, node.attrs.base],
    ['rt', {}, node.attrs.text],
  ],
  parseMarkdown: {
    match: (node) => (node as { type?: string }).type === 'ruby',
    runner: (state, node, type) => {
      const n = node as { base?: string; text?: string }
      state.addNode(type, {
        base: n.base ?? '',
        text: n.text ?? '',
      })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'ruby',
    runner: (state, node) => {
      const base = node.attrs.base as string
      const text = node.attrs.text as string
      state.addNode('text', undefined, `{${base}|${text}}`)
    },
  },
}))
