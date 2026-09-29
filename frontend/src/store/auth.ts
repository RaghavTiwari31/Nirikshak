import { create } from 'zustand'
import { safeStorage } from '@/lib/storage'

export interface AuthUser {
  id: number
  username: string
  display_name: string
  role: 'admin' | 'supervisor' | 'examiner' | 'auditor'
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  signIn: (token: string, user: AuthUser) => void
  signOut: () => void
}

const TOKEN_KEY = 'satsa.token'
const USER_KEY = 'satsa.user'

function loadUser(): AuthUser | null {
  const raw = safeStorage.get(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export const useAuth = create<AuthState>((set) => ({
  token: safeStorage.get(TOKEN_KEY),
  user: loadUser(),
  signIn: (token, user) => {
    safeStorage.set(TOKEN_KEY, token)
    safeStorage.set(USER_KEY, JSON.stringify(user))
    set({ token, user })
  },
  signOut: () => {
    safeStorage.remove(TOKEN_KEY)
    safeStorage.remove(USER_KEY)
    set({ token: null, user: null })
  },
}))
