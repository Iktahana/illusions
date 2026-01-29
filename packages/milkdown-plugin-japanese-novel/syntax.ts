/**
 * Remark plugins for Japanese novel syntax: Ruby {base|ruby} and TCY (tate-chu-yoko).
 */

import type { Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/** Ruby pattern: {base|ruby} */
const RUBY_RE = /\{([^|]+)\|([^}]+)\}/g

/** TCY: ^text^ for tate-chu-yoko (縦中横). */
const TCY_RE = /\^([^^]+)\^/g

/** No-break pattern: [[no-break:text]] */
const NO_BREAK_RE = /\[\[no-break:([^\]]+)\]\]/g

/** Kerning pattern: [[kern:amount:text]] with validation */
const KERN_RE = /\[\[kern:([+-]?\d+(?:\.\d+)?em):([^\]]+)\]\]/g
const KERN_AMOUNT_VALID_RE = /^[+-]?\d+(\.\d+)?em$/

type TextNode = { type: 'text'; value: string }
type RubyNode = { type: 'ruby'; base: string; text: string }
type TcyNode = { type: 'tcy'; value: string }
type NoBreakNode = { type: 'nobreak'; text: string }
type KernNode = { type: 'kern'; amount: string; text: string }
type InlineNode = TextNode | RubyNode | TcyNode | NoBreakNode | KernNode

type HeadingNode = {
  type: 'heading'
  depth?: number
  children?: InlineNode[]
  data?: Record<string, unknown>
}

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
      if (!/\^[^^]+\^/.test(value)) return
      const segments = splitTcy(value)
      if (segments.length <= 1) return
      const children = (parent as { children: unknown[] }).children
      children.splice(index, 1, ...segments)
    })
  }
}

function splitNoBreak(text: string): InlineNode[] {
  const segments: InlineNode[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  NO_BREAK_RE.lastIndex = 0
  while ((m = NO_BREAK_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, m.index) })
    }
    segments.push({ type: 'nobreak', text: m[1]! })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}

function splitKern(text: string): InlineNode[] {
  const segments: InlineNode[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  KERN_RE.lastIndex = 0
  while ((m = KERN_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, m.index) })
    }
    const amount = m[1]!
    const kernText = m[2]!
    
    // Validate amount format for security
    if (KERN_AMOUNT_VALID_RE.test(amount)) {
      segments.push({ type: 'kern', amount, text: kernText })
    } else {
      // Invalid format, keep as plain text
      segments.push({ type: 'text', value: m[0] })
    }
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}

export interface RemarkNoBreakOptions {
  enable?: boolean
}

export const remarkNoBreakPlugin: Plugin<[RemarkNoBreakOptions | undefined], Root> = (opts) => {
  const enable = opts?.enable !== false
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || typeof index !== 'number' || !enable) return
      const value = (node as TextNode).value
      if (!/\[\[no-break:/.test(value)) return
      const segments = splitNoBreak(value)
      if (segments.length <= 1) return
      const children = (parent as { children: unknown[] }).children
      children.splice(index, 1, ...segments)
    })
  }
}

export interface RemarkKernOptions {
  enable?: boolean
}

export const remarkKernPlugin: Plugin<[RemarkKernOptions | undefined], Root> = (opts) => {
  const enable = opts?.enable !== false
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || typeof index !== 'number' || !enable) return
      const value = (node as TextNode).value
      if (!/\[\[kern:/.test(value)) return
      const segments = splitKern(value)
      if (segments.length <= 1) return
      const children = (parent as { children: unknown[] }).children
      children.splice(index, 1, ...segments)
    })
  }
}

export const remarkHeadingAnchorPlugin: Plugin<[], Root> = () => {
  return (tree) => {
    // No longer need to process heading anchors
    // IDs are generated from heading content directly
  }
}
