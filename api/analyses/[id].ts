import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAdminClient } from '../_lib/supabase'
import { authenticate } from '../_lib/auth'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: '方法不允许' })
    return
  }

  const userId = await authenticate(req, res)
  if (!userId) return

  const id = req.query.id
  if (typeof id !== 'string' || !id) {
    res.status(400).json({ error: '缺少分析 ID' })
    return
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('analyses')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    res.status(404).json({ error: '分析记录不存在' })
    return
  }

  res.status(200).json(data)
}
