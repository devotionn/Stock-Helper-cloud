import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAdminClient } from './supabase'

/**
 * 从请求头解析 Bearer JWT 并通过 Supabase service role 验证用户身份。
 *
 * 成功返回 user_id；失败时已向客户端写入响应并返回 null，
 * 调用方在收到 null 时应直接 return 结束处理。
 */
export async function authenticate(
  req: VercelRequest,
  res: VercelResponse,
): Promise<string | null> {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Vary', 'Authorization')

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '缺少 Authorization Bearer 头' })
    return null
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) {
    res.status(401).json({ error: '无效的 Authorization 头' })
    return null
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) {
      res.status(401).json({ error: '身份验证失败，请重新登录' })
      return null
    }

    return data.user.id
  } catch (error) {
    console.error('Supabase 服务端配置或身份验证异常', error)
    res.status(500).json({ error: '服务端配置不完整，请检查 Supabase 环境变量' })
    return null
  }
}
