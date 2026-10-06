import createClient from 'openapi-fetch'
import type { paths } from './schema'

/** Typed same-origin API client generated from the backend OpenAPI contract. */
export const api = createClient<paths>({ baseUrl: '' })
