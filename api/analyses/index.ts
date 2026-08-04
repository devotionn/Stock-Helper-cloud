import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  SYSTEM_PROMPT,
  buildAnalysisHeaderText,
  analysisResultSchema,
  MODULE_MAP,
  ANALYSIS_STATUS,
  IMAGE_CONFIG,
  STORAGE_BUCKET,
} from '@stock-helper/shared'
import { createAdminClient } from '../_lib/supabase'
import { authenticate } from '../_lib/auth'
import { getAiServerConfig } from '../_lib/env'

interface CreateAnalysisBody {
  module_ids: number[]
  analysis_request: string
  combination_name: string
  record_date: string
}

interface EntryRow {
  id: string
  module_id: number
  display_title: string
  text_content: string
}

interface AssetNested {
  id: string
  storage_path: string
  ai_storage_path: string | null
  thumbnail_path: string | null
}

interface EntryAssetRow {
  module_entry_id: string
  order_index: number
  caption: string
  // Supabase 把嵌套关系推断为数组，运行时 many-to-one 实为单对象。
  assets: AssetNested | AssetNested[] | null
}

function firstAsset(a: AssetNested | AssetNested[] | null): AssetNested | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

interface SnapshotInsert {
  analysis_id: string
  module_id: number
  order_index: number
  module_name: string
  display_title: string
  text_content: string
}

interface AnalysisAssetInsert {
  analysis_id: string
  module_id: number
  order_index: number
  image_order_index: number
  asset_id: string
  storage_path: string
  thumbnail_path: string | null
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type AnalysisStatus = (typeof ANALYSIS_STATUS)[keyof typeof ANALYSIS_STATUS]

const SIGNED_URL_EXPIRY = 300
const MAX_ANALYSIS_REQUEST_LENGTH = 4_000
const MAX_COMBINATION_NAME_LENGTH = 100
const MAX_RAW_RESULT_LENGTH = 200_000
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: '方法不允许' })
    return
  }

  const userId = await authenticate(req, res)
  if (!userId) return

  const body = normalizeRequestBody(req.body)
  if (!body) {
    res.status(400).json({ error: '请求参数格式不正确' })
    return
  }

  const invalidModuleId = body.module_ids.some(
    (id) => !Number.isInteger(id) || id < 0 || id > 11,
  )
  if (body.module_ids.length === 0 || body.module_ids.length > 12 || invalidModuleId) {
    res.status(400).json({ error: 'module_ids 必须包含 1 到 12 个有效模块编号（0-11）' })
    return
  }
  if (!isValidIsoDate(body.record_date)) {
    res.status(400).json({ error: 'record_date 必须是有效的 YYYY-MM-DD 日期' })
    return
  }
  if (body.analysis_request.length > MAX_ANALYSIS_REQUEST_LENGTH) {
    res.status(400).json({ error: `analysis_request 不能超过 ${MAX_ANALYSIS_REQUEST_LENGTH} 个字符` })
    return
  }
  if (body.combination_name.length > MAX_COMBINATION_NAME_LENGTH) {
    res.status(400).json({ error: `combination_name 不能超过 ${MAX_COMBINATION_NAME_LENGTH} 个字符` })
    return
  }

  const moduleIds = [...new Set(body.module_ids)]
  const recordDate = body.record_date
  const analysisRequest = body.analysis_request
  const combinationName = body.combination_name

  const admin = createAdminClient()

  // 查询选中的模块内容（module_entries + entry_assets + assets）。
  const orderMap = new Map(moduleIds.map((id, idx) => [id, idx]))
  const { data: entriesData, error: entriesError } = await admin
    .from('module_entries')
    .select('id, module_id, display_title, text_content')
    .eq('user_id', userId)
    .eq('record_date', recordDate)
    .in('module_id', moduleIds)

  if (entriesError) {
    res.status(500).json({ error: '查询模块内容失败', detail: entriesError.message })
    return
  }

  const entries = (entriesData as EntryRow[] | null) ?? []
  if (entries.length === 0) {
    res.status(400).json({ error: '所选模块在指定日期没有内容' })
    return
  }

  const orderedEntries = [...entries].sort(
    (a, b) => (orderMap.get(a.module_id) ?? 0) - (orderMap.get(b.module_id) ?? 0),
  )

  const entryIds = orderedEntries.map((e) => e.id)
  const { data: entryAssetsData, error: entryAssetsError } = await admin
    .from('entry_assets')
    .select(
      'module_entry_id, order_index, caption, assets(id, storage_path, ai_storage_path, thumbnail_path)',
    )
    .in('module_entry_id', entryIds)
    .order('order_index', { ascending: true })

  if (entryAssetsError) {
    res.status(500).json({ error: '查询模块图片失败', detail: entryAssetsError.message })
    return
  }

  const entryAssets = (entryAssetsData as EntryAssetRow[] | null) ?? []
  const assetsByEntry = new Map<string, EntryAssetRow[]>()
  for (const entryAsset of entryAssets) {
    const list = assetsByEntry.get(entryAsset.module_entry_id) ?? []
    list.push(entryAsset)
    assetsByEntry.set(entryAsset.module_entry_id, list)
  }

  const { data: analysisRow, error: analysisError } = await admin
    .from('analyses')
    .insert({
      user_id: userId,
      combination: moduleIds,
      combination_name: combinationName,
      analysis_request: analysisRequest,
      record_date: recordDate,
      status: ANALYSIS_STATUS.RUNNING,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (analysisError || !analysisRow) {
    res
      .status(500)
      .json({ error: '创建分析记录失败', detail: analysisError?.message ?? '未知错误' })
    return
  }
  const analysisId = (analysisRow as { id: string }).id

  // 创建不可变分析快照。
  const snapshotRows: SnapshotInsert[] = []
  const assetRows: AnalysisAssetInsert[] = []
  const imagesForAI: Array<{ storage_path: string; thumbnail_path: string | null }> = []

  for (const entry of orderedEntries) {
    const orderIndex = orderMap.get(entry.module_id) ?? 0
    const moduleDef = MODULE_MAP[entry.module_id]
    const moduleName = moduleDef?.name ?? `模块${orderIndex + 1}`

    snapshotRows.push({
      analysis_id: analysisId,
      module_id: entry.module_id,
      order_index: orderIndex,
      module_name: moduleName,
      display_title: entry.display_title ?? '',
      text_content: entry.text_content ?? '',
    })

    const entryAssetList = assetsByEntry.get(entry.id) ?? []
    let imageIndex = 0
    for (const entryAsset of entryAssetList) {
      const asset = firstAsset(entryAsset.assets)
      if (!asset) continue

      const imagePath = asset.ai_storage_path ?? asset.storage_path
      assetRows.push({
        analysis_id: analysisId,
        module_id: entry.module_id,
        order_index: orderIndex,
        image_order_index: imageIndex,
        asset_id: asset.id,
        storage_path: imagePath,
        thumbnail_path: asset.thumbnail_path,
      })
      imagesForAI.push({ storage_path: imagePath, thumbnail_path: asset.thumbnail_path })
      imageIndex += 1
    }
  }

  if (snapshotRows.length > 0) {
    const { error: snapshotError } = await admin
      .from('analysis_snapshots')
      .insert(snapshotRows)
    if (snapshotError) {
      await markFailed(admin, analysisId, `保存分析快照失败: ${snapshotError.message}`)
      res.status(200).json({ id: analysisId, status: ANALYSIS_STATUS.FAILED, record_date: recordDate })
      return
    }
  }

  if (assetRows.length > 0) {
    const { error: assetError } = await admin.from('analysis_assets').insert(assetRows)
    if (assetError) {
      await markFailed(admin, analysisId, `保存分析图片快照失败: ${assetError.message}`)
      res.status(200).json({ id: analysisId, status: ANALYSIS_STATUS.FAILED, record_date: recordDate })
      return
    }
  }

  const finalStatus = await runAiAnalysis(admin, analysisId, {
    record_date: recordDate,
    orderedEntries,
    orderMap,
    analysisRequest,
    imagesForAI,
  })

  res.status(200).json({ id: analysisId, status: finalStatus, record_date: recordDate })
}

function normalizeRequestBody(value: unknown): CreateAnalysisBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const body = value as Record<string, unknown>
  if (!Array.isArray(body.module_ids)) return null
  if (typeof body.record_date !== 'string') return null
  if (body.analysis_request !== undefined && typeof body.analysis_request !== 'string') return null
  if (body.combination_name !== undefined && typeof body.combination_name !== 'string') return null

  return {
    module_ids: body.module_ids as number[],
    record_date: body.record_date.trim(),
    analysis_request: (body.analysis_request ?? '').trim() as string,
    combination_name: (body.combination_name ?? '').trim() as string,
  }
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

async function runAiAnalysis(
  admin: ReturnType<typeof createAdminClient>,
  analysisId: string,
  ctx: {
    record_date: string
    orderedEntries: EntryRow[]
    orderMap: Map<number, number>
    analysisRequest: string
    imagesForAI: Array<{ storage_path: string; thumbnail_path: string | null }>
  },
): Promise<AnalysisStatus> {
  let aiConfig: ReturnType<typeof getAiServerConfig>
  try {
    aiConfig = getAiServerConfig()
  } catch (error) {
    await markFailed(admin, analysisId, error instanceof Error ? error.message : String(error))
    return ANALYSIS_STATUS.FAILED
  }

  const headerText = buildAnalysisHeaderText(
    ctx.record_date,
    ctx.orderedEntries.map((entry) => ({
      order_index: ctx.orderMap.get(entry.module_id) ?? 0,
      module_name: MODULE_MAP[entry.module_id]?.name ?? '',
      display_title: entry.display_title ?? '',
      text_content: entry.text_content ?? '',
    })),
    ctx.analysisRequest,
  )

  const aiImages = ctx.imagesForAI.slice(0, IMAGE_CONFIG.AI_MAX_IMAGES)
  let signedUrls: string[] = []
  if (aiImages.length > 0) {
    const signedResults = await Promise.all(
      aiImages.map((image) =>
        admin.storage.from(STORAGE_BUCKET).createSignedUrl(image.storage_path, SIGNED_URL_EXPIRY),
      ),
    )
    signedUrls = signedResults
      .map((result) => result.data?.signedUrl)
      .filter((url): url is string => Boolean(url))
  }

  const userContent: ContentPart[] = [{ type: 'text', text: headerText }]
  for (const url of signedUrls) {
    userContent.push({ type: 'image_url', image_url: { url } })
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]

  const requestBody: Record<string, unknown> = {
    model: aiConfig.model,
    messages,
  }
  if (aiConfig.useJsonResponseFormat) {
    requestBody.response_format = { type: 'json_object' }
  }

  let rawResult = ''
  let resultJson: string | null = null
  let errorMessage: string | null = null
  let tokenUsage: Record<string, unknown> | null = null
  let finalStatus: AnalysisStatus = ANALYSIS_STATUS.COMPLETED

  try {
    const aiResponse = await fetch(buildChatCompletionsUrl(aiConfig.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(aiConfig.timeoutMs),
    })

    if (!aiResponse.ok) {
      finalStatus = ANALYSIS_STATUS.FAILED
      const responseText = await aiResponse.text().catch(() => '')
      rawResult = truncateText(responseText, MAX_RAW_RESULT_LENGTH)
      errorMessage = `AI 调用失败: HTTP ${aiResponse.status}${
        responseText ? ` - ${truncateText(responseText, 500)}` : ''
      }`
    } else {
      const aiData = (await aiResponse.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        usage?: Record<string, unknown>
      }
      rawResult = truncateText(aiData?.choices?.[0]?.message?.content ?? '', MAX_RAW_RESULT_LENGTH)
      if (aiData?.usage) tokenUsage = aiData.usage

      try {
        const parsed = parseJsonContent(rawResult)
        const validated = analysisResultSchema.safeParse(parsed)
        if (validated.success) {
          resultJson = JSON.stringify(validated.data)
        } else {
          finalStatus = ANALYSIS_STATUS.FAILED
          errorMessage = `AI 结果校验失败: ${validated.error.message}`
        }
      } catch (error) {
        finalStatus = ANALYSIS_STATUS.FAILED
        errorMessage = `AI 返回内容无法解析为 JSON: ${
          error instanceof Error ? error.message : String(error)
        }`
      }
    }
  } catch (error) {
    finalStatus = ANALYSIS_STATUS.FAILED
    errorMessage = `AI 调用异常: ${error instanceof Error ? error.message : String(error)}`
  }

  const { error: updateError } = await admin
    .from('analyses')
    .update({
      status: finalStatus,
      result_json: resultJson,
      raw_result: rawResult || null,
      error_message: errorMessage,
      provider: aiConfig.provider,
      model: aiConfig.model,
      token_usage: tokenUsage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', analysisId)

  if (updateError) {
    console.error('回写分析结果失败', { analysisId, message: updateError.message })
  }

  return finalStatus
}

function buildChatCompletionsUrl(baseUrl: string): string {
  return baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`
}

function parseJsonContent(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('返回内容为空')

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    return JSON.parse(withoutFence)
  } catch {
    const firstBrace = withoutFence.indexOf('{')
    const lastBrace = withoutFence.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1))
    }
    throw new Error('未找到有效 JSON 对象')
  }
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n...[内容已截断]`
}

async function markFailed(
  admin: ReturnType<typeof createAdminClient>,
  analysisId: string,
  message: string,
): Promise<void> {
  const { error } = await admin
    .from('analyses')
    .update({
      status: ANALYSIS_STATUS.FAILED,
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    .eq('id', analysisId)

  if (error) {
    console.error('标记分析失败状态时发生异常', { analysisId, message: error.message })
  }
}
