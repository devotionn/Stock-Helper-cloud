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
  // supabase 把嵌套关系推断为数组，运行时 many-to-one 实为单对象，统一用 firstAsset 归一化
  assets: AssetNested | AssetNested[] | null
}

/** 从嵌套关系中取出单条 asset（兼容数组与对象两种形态） */
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

const SIGNED_URL_EXPIRY = 300 // 5 分钟，足够 AI 服务抓取图片

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: '方法不允许' })
    return
  }

  const userId = await authenticate(req, res)
  if (!userId) return

  const body = (req.body ?? {}) as CreateAnalysisBody
  if (!Array.isArray(body.module_ids) || body.module_ids.length === 0) {
    res.status(400).json({ error: 'module_ids 不能为空' })
    return
  }
  if (!body.record_date || typeof body.record_date !== 'string') {
    res.status(400).json({ error: 'record_date 不能为空' })
    return
  }

  const { module_ids, record_date } = body
  const analysisRequest = body.analysis_request ?? ''
  const combinationName = body.combination_name ?? ''

  const admin = createAdminClient()

  // ---- a/b. 查询选中的模块内容（module_entries + entry_assets + assets）----
  const orderMap = new Map(module_ids.map((id, idx) => [id, idx]))
  const { data: entriesData, error: entriesError } = await admin
    .from('module_entries')
    .select('id, module_id, display_title, text_content')
    .eq('user_id', userId)
    .eq('record_date', record_date)
    .in('module_id', module_ids)

  if (entriesError) {
    res.status(500).json({ error: '查询模块内容失败', detail: entriesError.message })
    return
  }

  const entries = (entriesData as EntryRow[] | null) ?? []
  if (entries.length === 0) {
    res.status(400).json({ error: '所选模块在指定日期没有内容' })
    return
  }

  // 按用户指定的模块顺序排序
  const orderedEntries = [...entries].sort(
    (a, b) => (orderMap.get(a.module_id) ?? 0) - (orderMap.get(b.module_id) ?? 0),
  )

  const entryIds = orderedEntries.map((e) => e.id)
  const { data: entryAssetsData, error: eaError } = await admin
    .from('entry_assets')
    .select('module_entry_id, order_index, caption, assets(id, storage_path, ai_storage_path, thumbnail_path)')
    .in('module_entry_id', entryIds)
    .order('order_index', { ascending: true })

  if (eaError) {
    res.status(500).json({ error: '查询模块图片失败', detail: eaError.message })
    return
  }

  const entryAssets = (entryAssetsData as EntryAssetRow[] | null) ?? []
  const assetsByEntry = new Map<string, EntryAssetRow[]>()
  for (const ea of entryAssets) {
    const list = assetsByEntry.get(ea.module_entry_id) ?? []
    list.push(ea)
    assetsByEntry.set(ea.module_entry_id, list)
  }

  // ---- c. 创建 analyses 记录（status = running）----
  const { data: analysisRow, error: analysisError } = await admin
    .from('analyses')
    .insert({
      user_id: userId,
      combination: module_ids,
      combination_name: combinationName,
      analysis_request: analysisRequest,
      record_date,
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

  // ---- d. 创建 analysis_snapshots 和 analysis_assets（不可变快照）----
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

    const eaList = assetsByEntry.get(entry.id) ?? []
    let imgIdx = 0
    for (const ea of eaList) {
      const asset = firstAsset(ea.assets)
      if (!asset) continue
      // 优先使用 AI 优化版图片（ai_storage_path），否则回退原图
      const imagePath = asset.ai_storage_path ?? asset.storage_path
      assetRows.push({
        analysis_id: analysisId,
        module_id: entry.module_id,
        order_index: orderIndex,
        image_order_index: imgIdx,
        asset_id: asset.id,
        storage_path: imagePath,
        thumbnail_path: asset.thumbnail_path,
      })
      imagesForAI.push({ storage_path: imagePath, thumbnail_path: asset.thumbnail_path })
      imgIdx += 1
    }
  }

  if (snapshotRows.length > 0) {
    const { error: snapError } = await admin.from('analysis_snapshots').insert(snapshotRows)
    if (snapError) {
      await markFailed(admin, analysisId, `保存分析快照失败: ${snapError.message}`)
      res.status(200).json({ id: analysisId, status: ANALYSIS_STATUS.FAILED, record_date })
      return
    }
  }
  if (assetRows.length > 0) {
    const { error: aError } = await admin.from('analysis_assets').insert(assetRows)
    if (aError) {
      await markFailed(admin, analysisId, `保存分析图片快照失败: ${aError.message}`)
      res.status(200).json({ id: analysisId, status: ANALYSIS_STATUS.FAILED, record_date })
      return
    }
  }

  // ---- e/f/g. 调用 AI 并用 Zod 校验结果 ----
  const finalStatus = await runAiAnalysis(admin, analysisId, {
    record_date,
    orderedEntries,
    orderMap,
    analysisRequest,
    imagesForAI,
  })

  // ---- h. 返回 ----
  res.status(200).json({ id: analysisId, status: finalStatus, record_date })
}

/**
 * 执行 AI 调用、校验并回写结果到 analyses 表。
 * 任何异常都会被捕获并把分析记录标记为 failed，返回最终状态。
 */
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
  const apiKey = process.env.AI_API_KEY
  const aiBaseUrl = (process.env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
  const aiModel = process.env.AI_MODEL ?? 'gpt-4o'

  if (!apiKey) {
    await markFailed(admin, analysisId, '缺少 AI_API_KEY 环境变量')
    return ANALYSIS_STATUS.FAILED
  }

  // 构建文本头部
  const headerText = buildAnalysisHeaderText(
    ctx.record_date,
    ctx.orderedEntries.map((e) => ({
      order_index: ctx.orderMap.get(e.module_id) ?? 0,
      module_name: MODULE_MAP[e.module_id]?.name ?? '',
      display_title: e.display_title ?? '',
      text_content: e.text_content ?? '',
    })),
    ctx.analysisRequest,
  )

  // 为私有图片生成签名 URL（service role 可为任意用户文件生成）
  const aiImages = ctx.imagesForAI.slice(0, IMAGE_CONFIG.AI_MAX_IMAGES)
  let signedUrls: string[] = []
  if (aiImages.length > 0) {
    const signedResults = await Promise.all(
      aiImages.map((img) =>
        admin.storage.from(STORAGE_BUCKET).createSignedUrl(img.storage_path, SIGNED_URL_EXPIRY),
      ),
    )
    signedUrls = signedResults
      .map((r) => r.data?.signedUrl)
      .filter((u): u is string => Boolean(u))
  }

  // 构建 OpenAI 兼容 messages
  const userContent: ContentPart[] = [{ type: 'text', text: headerText }]
  for (const url of signedUrls) {
    userContent.push({ type: 'image_url', image_url: { url } })
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]

  let rawResult = ''
  let resultJson: string | null = null
  let errorMessage: string | null = null
  let tokenUsage: Record<string, unknown> | null = null
  let finalStatus: AnalysisStatus = ANALYSIS_STATUS.COMPLETED

  try {
    const aiResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: aiModel,
        messages,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(110_000),
    })

    if (!aiResponse.ok) {
      finalStatus = ANALYSIS_STATUS.FAILED
      errorMessage = `AI 调用失败: HTTP ${aiResponse.status}`
      try {
        rawResult = await aiResponse.text()
      } catch {
        rawResult = ''
      }
    } else {
      const aiData = (await aiResponse.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        usage?: Record<string, unknown>
      }
      rawResult = aiData?.choices?.[0]?.message?.content ?? ''
      if (aiData?.usage) tokenUsage = aiData.usage

      let parsed: unknown = null
      try {
        parsed = rawResult ? JSON.parse(rawResult) : null
      } catch {
        finalStatus = ANALYSIS_STATUS.FAILED
        errorMessage = 'AI 返回内容无法解析为 JSON'
      }

      if (parsed !== null && finalStatus === ANALYSIS_STATUS.COMPLETED) {
        const validated = analysisResultSchema.safeParse(parsed)
        if (validated.success) {
          resultJson = JSON.stringify(validated.data)
        } else {
          finalStatus = ANALYSIS_STATUS.FAILED
          errorMessage = `AI 结果校验失败: ${validated.error.message}`
        }
      }
    }
  } catch (err) {
    finalStatus = ANALYSIS_STATUS.FAILED
    errorMessage = `AI 调用异常: ${err instanceof Error ? err.message : String(err)}`
  }

  // 回写结果
  await admin
    .from('analyses')
    .update({
      status: finalStatus,
      result_json: resultJson,
      raw_result: rawResult || null,
      error_message: errorMessage,
      provider: process.env.AI_PROVIDER ?? 'openai',
      model: aiModel,
      token_usage: tokenUsage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', analysisId)

  return finalStatus
}

/** 将分析记录标记为失败并写入错误信息与完成时间 */
async function markFailed(
  admin: ReturnType<typeof createAdminClient>,
  analysisId: string,
  message: string,
): Promise<void> {
  await admin
    .from('analyses')
    .update({
      status: ANALYSIS_STATUS.FAILED,
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    .eq('id', analysisId)
}
