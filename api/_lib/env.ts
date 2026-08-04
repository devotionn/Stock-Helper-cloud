const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

export function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

export function readRequiredEnv(name: string): string {
  const value = readOptionalEnv(name)
  if (!value) {
    throw new Error(`缺少服务端环境变量：${name}`)
  }
  return value
}

export function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = readOptionalEnv(name)?.toLowerCase()
  if (!raw) return fallback
  if (TRUE_VALUES.has(raw)) return true
  if (FALSE_VALUES.has(raw)) return false
  return fallback
}

export function readIntegerEnv(
  name: string,
  fallback: number,
  options: { min: number; max: number },
): number {
  const raw = readOptionalEnv(name)
  if (!raw) return fallback

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(options.max, Math.max(options.min, parsed))
}

export interface SupabaseServerConfig {
  url: string
  serviceRoleKey: string
}

export function getSupabaseServerConfig(): SupabaseServerConfig {
  const url = readOptionalEnv('SUPABASE_URL') ?? readOptionalEnv('VITE_SUPABASE_URL')
  const serviceRoleKey = readOptionalEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceRoleKey) {
    throw new Error(
      '缺少服务端 Supabase 环境变量：SUPABASE_URL（或 VITE_SUPABASE_URL）与 SUPABASE_SERVICE_ROLE_KEY',
    )
  }

  return {
    url: url.replace(/\/+$/, ''),
    serviceRoleKey,
  }
}

export interface AiServerConfig {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
  useJsonResponseFormat: boolean
}

export function getAiServerConfig(): AiServerConfig {
  return {
    provider: readOptionalEnv('AI_PROVIDER') ?? 'openai',
    apiKey: readRequiredEnv('AI_API_KEY'),
    baseUrl: (readOptionalEnv('AI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: readOptionalEnv('AI_MODEL') ?? 'gpt-4o',
    timeoutMs: readIntegerEnv('AI_REQUEST_TIMEOUT_MS', 105_000, {
      min: 5_000,
      max: 115_000,
    }),
    useJsonResponseFormat: readBooleanEnv('AI_JSON_RESPONSE_FORMAT', true),
  }
}

export function getConfigurationStatus(): {
  supabase: boolean
  ai: boolean
} {
  return {
    supabase: Boolean(
      (readOptionalEnv('SUPABASE_URL') ?? readOptionalEnv('VITE_SUPABASE_URL')) &&
        readOptionalEnv('SUPABASE_SERVICE_ROLE_KEY'),
    ),
    ai: Boolean(readOptionalEnv('AI_API_KEY')),
  }
}
