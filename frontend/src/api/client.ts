import { useAuth } from '@/store/auth'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuth.getState().token
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const resp = await fetch(`${BASE_URL}/api${path}`, { ...init, headers })
  if (resp.status === 401 && token) useAuth.getState().signOut()
  if (!resp.ok) {
    let detail = resp.statusText
    try {
      const body = (await resp.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(resp.status, detail)
  }
  return (await resp.json()) as T
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  version: string
  database: string
}

export const getHealth = (signal?: AbortSignal) => api<HealthResponse>('/health', { signal })
