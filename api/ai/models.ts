import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate } from '../_lib/auth'
import { readBooleanEnv, readOptionalEnv } from '../_lib/env'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: '方法不允许' })
    return
  }

  const userId = await authenticate(req, res)
  if (!userId) return

  // 只返回非敏感配置，不暴露 API Key。
  res.status(200).json({
    provider: readOptionalEnv('AI_PROVIDER') ?? 'openai',
    model: readOptionalEnv('AI_MODEL') ?? 'gpt-4o',
    configured: Boolean(readOptionalEnv('AI_API_KEY')),
    json_response_format: readBooleanEnv('AI_JSON_RESPONSE_FORMAT', true),
  })
}
