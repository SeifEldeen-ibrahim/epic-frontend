import { describe, expect, it } from 'vitest'
import { adminCopy } from './copy'

/** Words a non-technical clinic admin should never meet (T-COPY). */
export const BANNED = /\b(draft|drafts|seq|bundle|compiled|publish|published|publishing|routing|realtime|p50|p90|luna|gpt-live)\b|cfg-|entry agent/i

function strings(value: unknown, path: string, out: [string, string][]): [string, string][] {
  if (typeof value === 'string') out.push([path, value])
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown
    const sample = fn(2, 'x')
    if (typeof sample === 'string') out.push([path, sample])
  } else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out)
  }
  return out
}

describe('T-COPY: plain words in the admin area', () => {
  const all = strings(adminCopy, '', [])

  it('collects the copy (guard: the scan is not vacuous)', () => {
    expect(all.length).toBeGreaterThan(300)
    expect(all.map(([p]) => p)).toEqual(expect.arrayContaining(['changes.makeLive', 'home.checklist', 'help.departments']))
  })

  it('uses no technical words', () => {
    const hits = all.filter(([, text]) => BANNED.test(text))
    expect(hits).toEqual([])
  })

  it('has a one-line help text for every page', () => {
    for (const page of Object.keys(adminCopy.pages)) {
      expect(adminCopy.help[page], page).toBeTruthy()
    }
  })

  it('calls the routing section Departments everywhere', () => {
    expect(adminCopy.config.sections.routing).toBe('Departments')
    expect(adminCopy.nav.departments).toBe('Departments')
    expect(adminCopy.home.steps[1].title).toBe('Departments')
    expect(adminCopy.agents.redirectTargets).toBe('Where can this agent send callers? — Departments and agents')
  })
})
