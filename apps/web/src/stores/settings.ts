import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

export const useSettingsStore = defineStore('settings', () => {
  const fontSize = ref('18')
  const loaded = ref(false)

  function applyFontSize() {
    document.documentElement.style.setProperty('--font-size-base', fontSize.value + 'px')
  }

  async function load() {
    const auth = useAuthStore()
    if (!auth.isAuthenticated) return

    const { data } = await supabase
      .from('user_settings')
      .select('font_size')
      .eq('user_id', auth.userId)
      .maybeSingle()

    if (data) {
      fontSize.value = data.font_size
    } else {
      // 首次登录时创建默认设置
      await supabase.from('user_settings').insert({
        user_id: auth.userId,
        font_size: '18',
      })
    }
    applyFontSize()
    loaded.value = true
  }

  async function saveFontSize(value: string) {
    const auth = useAuthStore()
    fontSize.value = value
    applyFontSize()
    await supabase
      .from('user_settings')
      .upsert({ user_id: auth.userId, font_size: value })
  }

  return { fontSize, loaded, load, saveFontSize, applyFontSize }
})
