/**
 * Remark plugins for Japanese novel syntax: Ruby {base|ruby} and TCY (tate-chu-yoko).
 */

import type { Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/** Ruby pattern: {base|ruby} */
const RUBY_RE = /\{([^|]+)\|([^}]+)\}/g

/** TCY: 2 digits or repeated punctuation (!!, ??, ……). */
const TCY_RE = /(\d{2}|!!|\?\?|……)/g

type TextNode = { type: 'text'; value: string }
type RubyNode = { type: 'ruby'; base: string; text: string }
type TcyNode = { type: 'tcy'; value: string }
type InlineNode = TextNode | RubyNode | TcyNode

type HeadingNode = {
  type: 'heading'
  depth?: number
  children?: InlineNode[]
  data?: Record<string, unknown>
}

const HEADING_ANCHOR_RE = /\s*\{#([a-z0-9-]+)\}\s*$/i

function splitRuby(text: string): InlineNode[] {
  const segments: InlineNode[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  RUBY_RE.lastIndex = 0
  while ((m = RUBY_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, m.index) })
    }
    segments.push({ type: 'ruby', base: m[1]!, text: m[2]! })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}

function splitTcy(text: string): InlineNode[] {
  const segments: InlineNode[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  TCY_RE.lastIndex = 0
  while ((m = TCY_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, m.index) })
    }
    segments.push({ type: 'tcy', value: m[1]! })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}

export interface RemarkRubyOptions {
  enable?: boolean
}

export const remarkRubyPlugin: Plugin<[RemarkRubyOptions | undefined], Root> = (opts) => {
  const enable = opts?.enable !== false
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || typeof index !== 'number' || !enable) return
      const value = (node as TextNode).value
      if (!value.includes('{')) return
      const segments = splitRuby(value)
      if (segments.length <= 1) return
      const children = (parent as { children: unknown[] }).children
      children.splice(index, 1, ...segments)
    })
  }
}

export interface RemarkTcyOptions {
  enable?: boolean
}

export const remarkTcyPlugin: Plugin<[RemarkTcyOptions | undefined], Root> = (opts) => {
  const enable = opts?.enable !== false
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || typeof index !== 'number' || !enable) return
      const value = (node as TextNode).value
      if (!/\d{2}|!!|\?\?|……/.test(value)) return
      const segments = splitTcy(value)
      if (segments.length <= 1) return
      const children = (parent as { children: unknown[] }).children
      children.splice(index, 1, ...segments)
    })
  }
}

export const remarkHeadingAnchorPlugin: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'heading', (node) => {
      const heading = node as HeadingNode
      const children = heading.children
      if (!children || children.length === 0) return

      const lastChild = children[children.length - 1]
      if (!lastChild || lastChild.type !== 'text') return

      const match = lastChild.value.match(HEADING_ANCHOR_RE)
      if (!match) return

      const anchorId = match[1]
      const cleaned = lastChild.value.replace(HEADING_ANCHOR_RE, '').trimEnd()

      if (cleaned.length === 0) {
        children.pop()
      } else {
        lastChild.value = cleaned
      }

      heading.data = {
        ...(heading.data ?? {}),
        anchorId,
      }
    })
  }
}
