import { supabase } from '@/lib/supabase'
import type { Analysis, AnalysisDetail, AnalysisRow, AnalysisSnapshot } from '@/types'

/**
 * 创建分析任务 - 调用 Vercel Function
 * 敏感操作（AI调用）必须经过服务端，密钥不暴露给浏览器
 */
export async function createAnalysis(params: {
  module_ids: number[]
  analysis_request: string
  combination_name: string
  record_date: string
}): Promise<{ id: string; status: string; record_date: string }> {
  const { data: session } = await supabase.auth.getSession()
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
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return mapAnalysis(data as unknown as AnalysisRow)
}

/** 获取分析详情（含快照和备注） */
export async function getAnalysisDetail(id: string): Promise<AnalysisDetail> {
  const { data: analysisData, error: analysisError } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', id)
    .single()

  if (analysisError) throw analysisError

  const { data: snapshotsData } = await supabase
    .from('analysis_snapshots')
    .select('*')
    .eq('analysis_id', id)
    .order('order_index')

  const snapshots: AnalysisSnapshot[] = []
  for (const snap of snapshotsData || []) {
    const s = snap as {
      module_id: number
      order_index: number
      module_name: string
      display_title: string
      text_content: string
    }
    const { data: imgs } = await supabase
      .from('analysis_assets')
      .select('storage_path, thumbnail_path')
      .eq('analysis_id', id)
      .eq('module_id', s.module_id)
      .order('image_order_index')

    snapshots.push({
      module_id: s.module_id,
      order_index: s.order_index,
      module_name: s.module_name,
      display_title: s.display_title || '',
      text_content: s.text_content,
      images: (imgs || []).map((img) => ({
        storage_path: (img as { storage_path: string }).storage_path,
        thumbnail_path: (img as { thumbnail_path: string | null }).thumbnail_path,
      })),
    })
  }

  const { data: notesData } = await supabase
    .from('analysis_notes')
    .select('*')
    .eq('analysis_id', id)
    .order('created_at', { ascending: false })

  return {
    analysis: mapAnalysis(analysisData as unknown as AnalysisRow),
    snapshots,
    notes: (notesData || []).map((n) => ({
      id: (n as { id: string }).id,
      note: (n as { note: string }).note,
      created_at: (n as { created_at: string }).created_at,
    })),
  }
}

/** 将分析结果保存到模块 */
export async function saveToModule(
  analysisId: string,
  moduleId: number,
  content: string,
): Promise<void> {
  const { data: analysis } = await supabase
    .from('analyses')
    .select('record_date')
    .eq('id', analysisId)
    .single()

  if (!analysis) throw new Error('分析记录不存在')

  const recordDate = (analysis as { record_date: string | null }).record_date
  if (!recordDate) throw new Error('分析记录缺少投研日期')

  const { data: entry } = await supabase
    .from('module_entries')
    .select('*')
    .eq('record_date', recordDate)
    .eq('module_id', moduleId)
    .single()

  if (!entry) throw new Error('目标模块不存在')

  const entryRow = entry as { id: string; text_content: string; revision: number }
  const prefix = `【来自 ${recordDate} 分析 #${analysisId}】\n`
  const existing = entryRow.text_content || ''
  const newText = existing.trim()
    ? `${existing}\n\n---\n\n${prefix}${content}`
    : `${prefix}${content}`

  await supabase
    .from('module_entries')
    .update({ text_content: newText, revision: entryRow.revision + 1 })
    .eq('id', entryRow.id)

  const flag = moduleId === 9 ? 'saved_to_review' : 'saved_to_advice'
  await supabase.from('analyses').update({ [flag]: true }).eq('id', analysisId)
}

/** 更新复盘内容 */
export async function updateReview(analysisId: string, reviewContent: string): Promise<void> {
  const { error } = await supabase
    .from('analyses')
    .update({ review_content: reviewContent })
    .eq('id', analysisId)

  if (error) throw error
}
