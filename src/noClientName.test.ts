// @vitest-environment node
/**
 * The client asked not to be named: no user may see "EPIC" in the UI. Scans every shipped
 * source file under src/ (tests excluded) and index.html. Identifiers such as EPIC_MAIN_NUMBER
 * do not match the word boundary and stay allowed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const NAME = /\bepic\b/i

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    if (/\.test\.(ts|tsx)$/.test(name)) return []
    return /\.(ts|tsx|css|html|json)$/.test(name) ? [path] : []
  })
}

describe('client name', () => {
  it('never appears in user-visible source', () => {
    const hits = [...files(join(ROOT, 'src')), join(ROOT, 'index.html')].flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (NAME.test(line) ? [`${relative(ROOT, path)}:${i + 1}`] : [])),
    )
    expect(hits).toEqual([])
  })
})
