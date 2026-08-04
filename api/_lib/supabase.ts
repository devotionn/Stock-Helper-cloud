import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServerConfig } from './env'

/**
 * 创建 Supabase service role admin client。
 * service role 会绕过 RLS，只允许在 Vercel Functions 服务端使用。
 */
export function createAdminClient(): SupabaseClient {
  const { url, serviceRoleKey } = getSupabaseServerConfig()

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'stock-helper-cloud-vercel-functions',
      },
    },
  })
}
