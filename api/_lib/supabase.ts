import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * 获取 Supabase URL。
 * 优先读取服务端专用 SUPABASE_URL，回退到前端共享的 VITE_SUPABASE_URL。
 */
export function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
}

/**
 * 创建 Supabase service role admin client。
 * 使用 service role key 绕过 RLS，仅在 Vercel Functions 服务端使用，切勿暴露到浏览器。
 */
export function createAdminClient(): SupabaseClient {
  const url = getSupabaseUrl()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error(
      '缺少服务端 Supabase 环境变量：SUPABASE_URL（或 VITE_SUPABASE_URL）与 SUPABASE_SERVICE_ROLE_KEY',
    )
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
