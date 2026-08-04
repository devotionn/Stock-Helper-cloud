import { createClient } from '@supabase/supabase-js'

function readRequiredClientEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const value = import.meta.env[name]?.trim()
  if (!value) {
    throw new Error(`缺少前端环境变量：${name}`)
  }
  return value
}

const supabaseUrl = readRequiredClientEnv('VITE_SUPABASE_URL').replace(/\/+$/, '')
const supabaseAnonKey = readRequiredClientEnv('VITE_SUPABASE_ANON_KEY')

try {
  const parsed = new URL(supabaseUrl)
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('协议必须是 http 或 https')
  }
} catch (error) {
  throw new Error(
    `VITE_SUPABASE_URL 格式不正确：${error instanceof Error ? error.message : String(error)}`,
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      'X-Client-Info': 'stock-helper-cloud-web',
    },
  },
})
