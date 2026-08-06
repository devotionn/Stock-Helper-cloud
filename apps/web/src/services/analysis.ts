import { supabase } from '@/lib/supabase'
import type { Analysis, AnalysisDetail, AnalysisRow, AnalysisSnapshot } from '@/types'

const ANALYSIS_COLUMNS = `
  id,
  combination,
  combination_name,
  analysis_request,
  record_date,
  status,
  result_json,
  raw_result,
  error_message,
  created_at,
  started_at,
  completed_at,
  saved_to_review,
  saved_to_advice,
  review_content
`

interface SnapshotRow {
  module_id: number
  order_index: number
  module_name: string
  display_title: string | null
  text_content: string | null
}

interface AnalysisAssetRow {
  module_id: number
  storage_path: string
  thumbnail_path: string | null
}

interface AnalysisNoteRow {
  id: string
  note: string
  created_at: string
}

/**
 * 创建分析任务 - 调用 Vercel Function。
 * 敏感操作（AI 调用）必须经过服务端，密钥不暴露给浏览器。
 */
export async function createAnalysis(params: {
  module_ids: number[]
  analysis_request: string
  combination_name: string
  record_date: string
}): Promise<{ id: string; status: string; record_date: string }> {
  const { data: session, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError

  const token = session.session?.access_token
  if (!token) throw new Error('未登录，请重新登录')

  const response = await fetch('/api/analyses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '请求失败' }))
    throw new Error(error.error || `分析请求失败 (${response.status})`)
  }

  return response.json()
}

function mapAnalysis(row: AnalysisRow): Analysis {
  return {
    id: row.id,
    combination: row.combination,
    combination_name: row.combination_name,
    analysis_request: row.analysis_request,
    record_date: row.record_date,
    status: row.status,
    result_json: row.result_json,
    raw_result: row.raw_result,
    error_message: row.error_message,
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    saved_to_review: row.saved_to_review,
    saved_to_advice: row.saved_to_advice,
    review_content: row.review_content,
  }
}

/** 获取分析状态（用于轮询） */
export async function getAnalysis(id: string): Promise<Analysis> {
  const { data, error } = await supabase
    .from('analyses')
    .select(ANALYSIS_COLUMNS)
    .eq('id', id)
    .single()

  if (error) throw error
  return mapAnalysis(data as unknown as AnalysisRow)
}

/** 获取分析详情（含快照和备注） */
export async function getAnalysisDetail(id: string): Promise<AnalysisDetail> {
  const [analysisResult, snapshotsResult, assetsResult, notesResult] = await Promise.all([
    supabase.from('analyses').select(ANALYSIS_COLUMNS).eq('id', id).single(),
    supabase
      .from('analysis_snapshots')
      .select('module_id, order_index, module_name, display_title, text_content')
      .eq('analysis_id', id)
      .order('order_index'),
    supabase
      .from('analysis_assets')
      .select('module_id, storage_path, thumbnail_path, image_order_index')
      .eq('analysis_id', id)
      .order('image_order_index'),
    supabase
      .from('analysis_notes')
      .select('id, note, created_at')
      .eq('analysis_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (analysisResult.error) throw analysisResult.error
  if (snapshotsResult.error) throw snapshotsResult.error
  if (assetsResult.error) throw assetsResult.error
  if (notesResult.error) throw notesResult.error

  const assetsByModule = new Map<number, AnalysisSnapshot['images']>()
  for (const rawAsset of assetsResult.data ?? []) {
    const asset = rawAsset as AnalysisAssetRow
    const images = assetsByModule.get(asset.module_id) ?? []
    images.push({
      storage_path: asset.storage_path,
      thumbnail_path: asset.thumbnail_path,
    })
    assetsByModule.set(asset.module_id, images)
  }

  const snapshots = ((snapshotsResult.data ?? []) as SnapshotRow[]).map((snapshot) => ({
    module_id: snapshot.module_id,
    order_index: snapshot.order_index,
    module_name: snapshot.module_name,
    display_title: snapshot.display_title ?? '',
    text_content: snapshot.text_content ?? '',
    images: assetsByModule.get(snapshot.module_id) ?? [],
  }))

  return {
    analysis: mapAnalysis(analysisResult.data as unknown as AnalysisRow),
    snapshots,
    notes: ((notesResult.data ?? []) as AnalysisNoteRow[]).map((note) => ({
      id: note.id,
      note: note.note,
      created_at: note.created_at,
    })),
  }
}

/** 将分析结果保存到模块 */
export async function saveToModule(
  analysisId: string,
  moduleId: number,
  content: string,
): Promise<void> {
  const normalizedContent = content.trim()
  if (!normalizedContent) throw new Error('保存内容不能为空')

  const { data: analysis, error: analysisError } = await supabase
    .from('analyses')
    .select('record_date')
    .eq('id', analysisId)
    .single()

  if (analysisError) throw analysisError

  const recordDate = (analysis as { record_date: string | null }).record_date
  if (!recordDate) throw new Error('分析记录缺少投研日期')

  const { data: entry, error: entryError } = await supabase
    .from('module_entries')
    .select('id, text_content, revision')
    .eq('record_date', recordDate)
    .eq('module_id', moduleId)
    .single()

  if (entryError) throw entryError

  const entryRow = entry as { id: string; text_content: string | null; revision: number }
  const prefix = `【来自 ${recordDate} 分析 #${analysisId}】\n`
  const existing = entryRow.text_content ?? ''
  const newText = existing.trim()
    ? `${existing}\n\n---\n\n${prefix}${normalizedContent}`
    : `${prefix}${normalizedContent}`

  // 使用 revision 做乐观锁，避免多窗口同时保存导致内容被静默覆盖。
  const { data: updatedEntry, error: updateEntryError } = await supabase
    .from('module_entries')
    .update({ text_content: newText, revision: entryRow.revision + 1 })
    .eq('id', entryRow.id)
    .eq('revision', entryRow.revision)
    .select('id')
    .maybeSingle()

  if (updateEntryError) throw updateEntryError
  if (!updatedEntry) throw new Error('模块内容已在其他页面被修改，请刷新后重试')

  const flag = moduleId === 9 ? 'saved_to_review' : 'saved_to_advice'
  const { error: updateAnalysisError } = await supabase
    .from('analyses')
    .update({ [flag]: true })
    .eq('id', analysisId)

  if (updateAnalysisError) throw updateAnalysisError
}

/** 更新复盘内容 */
export async function updateReview(analysisId: string, reviewContent: string): Promise<void> {
  const { error } = await supabase
    .from('analyses')
    .update({ review_content: reviewContent })
    .eq('id', analysisId)

  if (error) throw error
}
