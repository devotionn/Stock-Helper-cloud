import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getConfigurationStatus } from './_lib/env'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: '方法不允许' })
    return
  }

  const configuration = getConfigurationStatus()

  res.status(200).json({
    status: 'ok',
    app: 'stock-helper-cloud',
    timestamp: new Date().toISOString(),
    ready: configuration.supabase && configuration.ai,
    configuration: {
      supabase: configuration.supabase ? 'configured' : 'missing',
      ai: configuration.ai ? 'configured' : 'missing',
    },
  })
}
