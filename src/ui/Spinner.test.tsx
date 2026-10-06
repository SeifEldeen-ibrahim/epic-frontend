/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/ui/ui.css'), 'utf8')
afterEach(cleanup)
import { Spinner } from './Spinner'

describe('Spinner', () => {
  it('renders an accessible status', () => {
    render(<Spinner label="Checking" />)
    expect(screen.getByRole('status', { name: 'Checking' })).toHaveClass('ui-spinner')
  })

  it('has no animation under prefers-reduced-motion: reduce', () => {
    // jsdom cannot evaluate media queries, so assert the stylesheet rule itself.
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)
    expect(block).not.toBeNull()
    expect(block![1]).toMatch(/\.ui-spinner\s*\{\s*animation:\s*none;/)
  })
})
