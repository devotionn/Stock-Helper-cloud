import { supabase } from '@/lib/supabase'
import type { HistoryList, HistoryItem, AnalysisDetail, AnalysisRow } from '@/types'

export interface HistoryQueryParams {
  date_from?: string
  date_to?: string
  combination_name?: string
  stock_name?: string
  module_id?: number
  keyword?: string
  page: number
  page_size: number
}

export async function listHistory(params: HistoryQueryParams): Promise<HistoryList> {
  let query = supabase
    .from('analyses')
    .select('*', { count: 'exact' })

  if (params.date_from) query = query.gte('record_date', params.date_from)
  if (params.date_to) query = query.lte('record_date', params.date_to)
  if (params.combination_name) query = query.ilike('combination_name', `%${params.combination_name}%`)

  if (params.keyword) {
    query = query.or(
      `analysis_request.ilike.%${params.keyword}%,raw_result.ilike.%${params.keyword}%`,
    )
  }

  query = query
    .order('record_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range((params.page - 1) * params.page_size, params.page * params.page_size - 1)

  const { data, count, error } = await query

  if (error) throw error

  const items: HistoryItem[] = []
  for (const row of data || []) {
    const r = row as AnalysisRow
    const { data: snapshots } = await supabase
      .from('analysis_snapshots')
      .select('module_id, module_name, display_title')
      .eq('analysis_id', r.id)
      .order('order_index')

    const hasModule = params.module_id !== undefined
    const hasStock = !!params.stock_name

    let moduleSnapshots = (snapshots || []) as {
      module_id: number
      module_name: string
      display_title: string
    }[]

    if (hasModule) {
      moduleSnapshots = moduleSnapshots.filter((s) => s.module_id === params.module_id)
      if (moduleSnapshots.length === 0) continue
    }

    if (hasStock) {
      const matched = moduleSnapshots.some(
        (s) =>
          s.display_title?.toLowerCase().includes(params.stock_name!.toLowerCase()) ||
          s.module_name?.toLowerCase().includes(params.stock_name!.toLowerCase()),
      )
      if (!matched) continue
    }

    items.push({
      id: r.id,
      combination: r.combination,
      combination_name: r.combination_name,
      analysis_request: r.analysis_request,
      record_date: r.record_date || r.created_at.slice(0, 10),
      status: r.status,
      created_at: r.created_at,
      completed_at: r.completed_at,
      modules: moduleSnapshots.map((s) => ({
        module_id: s.module_id,
        module_name: s.module_name,
        display_title: s.display_title || '',
      })),
    })
  }

  return {
    total: count ?? 0,
    page: params.page,
    page_size: params.page_size,
    items,
  }
}

export async function getHistoryDetail(id: string): Promise<AnalysisDetail> {
  // 复用 analysis service 的 getAnalysisDetail 逻辑
  const { getAnalysisDetail } = await import('./analysis')
  return getAnalysisDetail(id)
}

export async function updateNote(analysisId: string, note: string): Promise<void> {
  const { data: existing } = await supabase
    .from('analysis_notes')
    .select('id')
    .eq('analysis_id', analysisId)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('analysis_notes')
      .update({ note })
      .eq('id', (existing as { id: string }).id)
  } else {
    await supabase.from('analysis_notes').insert({
      analysis_id: analysisId,
      note,
    })
  }
}

export async function deleteHistory(id: string): Promise<void> {
  const { error } = await supabase.from('analyses').delete().eq('id', id)
  if (error) throw error
}
