import type { VercelRequest, VercelResponse } from '@vercel/node'
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

  // 返回当前配置的 AI 模型信息，不暴露密钥
  res.status(200).json({
    provider: process.env.AI_PROVIDER ?? 'openai',
    model: process.env.AI_MODEL ?? 'gpt-4o',
    base_url: process.env.AI_BASE_URL ?? 'https://api.openai.com/v1',
    configured: Boolean(process.env.AI_API_KEY),
  })
}
