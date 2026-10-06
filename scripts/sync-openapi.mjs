#!/usr/bin/env node
// Sync the backend OpenAPI document (the contract authority) into
// openapi/openapi.json as canonical JSON: keys sorted recursively,
// 2-space indent, trailing newline. Never hand-edit the snapshot.
//
//   node scripts/sync-openapi.mjs            fetch from OPENAPI_SOURCE and write
//   node scripts/sync-openapi.mjs --offline  only verify the snapshot exists
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'openapi', 'openapi.json')
const SOURCE = process.env.OPENAPI_SOURCE ?? 'http://backend:8000/api/openapi.json'
const TIMEOUT_MS = 10_000

function fail(message) {
  console.error(`sync-openapi: ${message}`)
  process.exit(1)
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    )
  }
  return value
}

function assertOpenApi(doc, origin) {
  if (doc === null || typeof doc !== 'object' || typeof doc.openapi !== 'string' || !doc.paths) {
    fail(`${origin} is not an OpenAPI document (missing "openapi" or "paths")`)
  }
}

async function offline() {
  let text
  try {
    text = await readFile(OUT, 'utf8')
  } catch {
    fail(`--offline: snapshot ${relative(ROOT, OUT)} does not exist; run without --offline against a live backend first`)
  }
  let doc
  try {
    doc = JSON.parse(text)
  } catch (err) {
    fail(`--offline: snapshot ${relative(ROOT, OUT)} is not valid JSON (${err.message})`)
  }
  assertOpenApi(doc, relative(ROOT, OUT))
  console.log(`sync-openapi: using existing snapshot ${relative(ROOT, OUT)} (OpenAPI ${doc.openapi})`)
}

async function online() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res
  try {
    res = await fetch(SOURCE, { signal: controller.signal, headers: { accept: 'application/json' } })
  } catch (err) {
    const reason = err?.name === 'AbortError' ? `timed out after ${TIMEOUT_MS / 1000}s` : (err?.cause?.message ?? err.message)
    fail(`could not fetch ${SOURCE}: ${reason}. Is the backend up? Set OPENAPI_SOURCE or use --offline.`)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) fail(`${SOURCE} answered HTTP ${res.status} ${res.statusText}`)

  let doc
  try {
    doc = await res.json()
  } catch (err) {
    fail(`${SOURCE} did not return valid JSON (${err.message})`)
  }
  assertOpenApi(doc, SOURCE)

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, `${JSON.stringify(canonical(doc), null, 2)}\n`, 'utf8')
  console.log(`sync-openapi: wrote ${relative(ROOT, OUT)} from ${SOURCE} (OpenAPI ${doc.openapi})`)
}

const args = process.argv.slice(2)
const unknown = args.filter((a) => a !== '--offline')
if (unknown.length) fail(`unknown argument(s): ${unknown.join(' ')} (supported: --offline)`)

await (args.includes('--offline') ? offline() : online())
