/**
 * milkdown-plugin-japanese-novel
 * Japanese novel support: vertical writing, Ruby, tate-chu-yoko, manuscript style.
 */

import type { MilkdownPlugin } from '@milkdown/ctx'
import { $prose, $remark } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { rubySchema } from './nodes/ruby'
import { tcySchema } from './nodes/tcy'
import { headingAnchorSchema } from './nodes/heading-anchor'
import { remarkHeadingAnchorPlugin, remarkRubyPlugin, remarkTcyPlugin } from './syntax'
import { createHeadingIdFixerPlugin } from './plugins/heading-id-fixer'
import {
  defaultJapaneseNovelOptions,
  type JapaneseNovelOptions,
} from './config'

export type { JapaneseNovelOptions } from './config'
export { calculateManuscriptPages, countCharacters } from './utils'

/**
 * Japanese novel plugin. Use with .use(japaneseNovel({ isVertical, ... })).
 */
export function japaneseNovel(
  options: JapaneseNovelOptions = {}
): MilkdownPlugin[] {
  const opts = { ...defaultJapaneseNovelOptions, ...options }
  const {
    isVertical,
    showManuscriptLine,
    enableRuby,
    enableTcy,
  } = opts

  const classes: string[] = ['milkdown-japanese-base']
  if (isVertical) {
    classes.push('milkdown-japanese-vertical')
  } else {
    classes.push('milkdown-japanese-horizontal')
  }
  if (showManuscriptLine) classes.push('manuscript-style')

  const remarkRuby = $remark(
    'japaneseNovelRuby',
    () => (remarkRubyPlugin as (o?: { enable?: boolean }) => (tree: unknown) => void),
    { enable: enableRuby }
  )
  const remarkTcy = $remark(
    'japaneseNovelTcy',
    () => (remarkTcyPlugin as (o?: { enable?: boolean }) => (tree: unknown) => void),
    { enable: enableTcy }
  )
  const remarkHeadingAnchor = $remark(
    'japaneseNovelHeadingAnchor',
    () => remarkHeadingAnchorPlugin
  )

  const stylePlugin = $prose(() => {
    const classList = [...classes]
    return new Plugin({
      key: new PluginKey('japaneseNovelStyle'),
      view: (editorView) => {
        const el = editorView.dom
        classList.forEach((c) => el.classList.add(c))
        return {
          destroy: () => {
            classList.forEach((c) => el.classList.remove(c))
          },
        }
      },
    })
  })

  const headingIdFixerPlugin = $prose((ctx) => {
    // Import generateAnchorId - we need to get it from the context
    // For now, use a simple generator
    const generateId = (level: number) => {
      const random = Math.random().toString(36).slice(2, 10)
      return `h${level}-${random}`
    }
    return createHeadingIdFixerPlugin(generateId)
  })

  const plugins: MilkdownPlugin[] = [
    ...(enableRuby ? [remarkRuby, rubySchema] : []),
    ...(enableTcy ? [remarkTcy, tcySchema] : []),
    remarkHeadingAnchor,
    headingAnchorSchema,
    headingIdFixerPlugin,
    stylePlugin,
  ].flat()

  return plugins
}
