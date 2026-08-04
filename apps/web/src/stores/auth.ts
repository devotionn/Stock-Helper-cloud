import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(true)
  const initialized = ref(false)
  let initPromise: Promise<void> | null = null
  let authListenerRegistered = false

  const isAuthenticated = computed(() => Boolean(user.value))
  const userId = computed(() => user.value?.id ?? '')

  async function init(): Promise<void> {
    if (initialized.value) return
    if (initPromise) return initPromise

    initPromise = (async () => {
      loading.value = true
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          console.error('恢复登录会话失败', error)
          user.value = null
        } else {
          user.value = data.session?.user ?? null
        }

        if (!authListenerRegistered) {
          authListenerRegistered = true
          supabase.auth.onAuthStateChange((_event, session) => {
            user.value = session?.user ?? null
            initialized.value = true
            loading.value = false
          })
        }
      } finally {
        initialized.value = true
        loading.value = false
      }
    })()

    try {
      await initPromise
    } finally {
      initPromise = null
    }
  }

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    user.value = data.user
    initialized.value = true
    return data
  }

  async function signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    user.value = null
    initialized.value = true
  }

  return {
    user,
    loading,
    initialized,
    isAuthenticated,
    userId,
    init,
    signIn,
    signOut,
  }
})
