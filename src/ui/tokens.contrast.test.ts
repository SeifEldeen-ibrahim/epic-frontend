// @vitest-environment node
import { describe, expect, it } from 'vitest'
/// <reference types="node" />
import { readFileSync } from 'node:fs'

const tokensCss = readFileSync(new URL('../theme/tokens.css', import.meta.url), 'utf8')

type Tokens = Record<string, string>

function parseVars(block: string): Tokens {
  const out: Tokens = {}
  for (const m of block.matchAll(/--brand-([a-z-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

function parseThemes(css: string): { light: Tokens; dark: Tokens } {
  const rootMatch = css.match(/^:root\s*\{([\s\S]*?)\}/m)
  const darkMatch = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}/)
  if (!rootMatch || !darkMatch) throw new Error('tokens.css: missing :root or dark block')
  const light = parseVars(rootMatch[1])
  return { light, dark: { ...light, ...parseVars(darkMatch[1]) } }
}

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const AA_PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['primary', 'bg'],
  ['on-primary', 'primary'],
  ['danger', 'bg'],
  // Admin area: nav current link and table links sit on surface; the shell alert too.
  ['primary', 'surface'],
  ['danger', 'surface'],
  ['success', 'bg'],
  ['warning', 'bg'],
]
const UI_PAIRS: [string, string][] = [
  ['focus', 'bg'],
  ['focus', 'surface'],
]

const themes = parseThemes(tokensCss)

describe.each(['light', 'dark'] as const)('%s theme token contrast', (theme) => {
  const t = themes[theme]
  it.each(AA_PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(t[fg], fg).toMatch(/^#[0-9a-f]{3,6}$/i)
    expect(t[bg], bg).toMatch(/^#[0-9a-f]{3,6}$/i)
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
  })
  it.each(UI_PAIRS)('%s on %s is at least 3:1', (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(3)
  })
})
