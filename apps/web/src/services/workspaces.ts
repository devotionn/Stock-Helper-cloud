import { supabase } from '@/lib/supabase'
import { MODULES, COMPLETED_ANALYSIS_STATUSES } from '@stock-helper/shared'
import type { Workspace, ModuleEntry, CalendarDay } from '@/types'
import type { ModuleEntryRow, EntryAssetRow, AssetRow } from '@/types'

function textSummary(text: string, maxLen = 50): string {
  const normalized = (text || '').trim().replace(/\n/g, ' ')
  if (!normalized) return ''
  return normalized.slice(0, maxLen) + (normalized.length > maxLen ? '...' : '')
}

function entryHasContent(row: ModuleEntryRow, imageCount: number): boolean {
  return !!(
    (row.text_content || '').trim() ||
    (row.display_title || '').trim() ||
    imageCount > 0
  )
}

async function getEntryImageCount(entryId: string): Promise<number> {
  const { count } = await supabase
    .from('entry_assets')
    .select('*', { count: 'exact', head: true })
    .eq('module_entry_id', entryId)
  return count ?? 0
}

async function buildModuleEntry(
  row: ModuleEntryRow,
): Promise<ModuleEntry> {
  const imageCount = await getEntryImageCount(row.id)
  const module = MODULES.find((m) => m.id === row.module_id)!
  return {
    entry_id: row.id,
    record_date: row.record_date,
    module_id: row.module_id,
    module_name: module.name,
    module_desc: module.desc,
    display_title: row.display_title || '',
    text_content: row.text_content || '',
    revision: row.revision,
    status: row.status || 'draft',
    period_start: row.period_start,
    period_end: row.period_end,
    updated_at: row.updated_at,
    image_count: imageCount,
    has_content: entryHasContent(row, imageCount),
    text_summary: textSummary(row.text_content),
  }
}

/** 确保指定日期的 12 个模块条目都存在 */
export async function ensureEntries(recordDate: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')

  const { data: existing } = await supabase
    .from('module_entries')
    .select('module_id')
    .eq('user_id', user.id)
    .eq('record_date', recordDate)

  const existingIds = new Set((existing || []).map((r) => r.module_id))
  const toInsert = MODULES.filter((m) => !existingIds.has(m.id))
  if (toInsert.length === 0) return

  await supabase.from('module_entries').insert(
    toInsert.map((m) => ({
      user_id: user.id,
      module_id: m.id,
      record_date: recordDate,
    })),
  )
}

/** 获取指定投研日期的完整工作区 */
export async function getWorkspace(recordDate: string): Promise<Workspace> {
  await ensureEntries(recordDate)
  const { data, error } = await supabase
    .from('module_entries')
    .select('*')
    .eq('record_date', recordDate)
    .order('module_id')

  if (error) throw error

  const rows = (data || []) as unknown as ModuleEntryRow[]
  const cards = await Promise.all(rows.map(buildModuleEntry))

  const { count: analysisCount } = await supabase
    .from('analyses')
    .select('*', { count: 'exact', head: true })
    .eq('record_date', recordDate)
    .in('status', [...COMPLETED_ANALYSIS_STATUSES])

  const completedCount = cards.filter((c) => c.has_content).length
  const totalCount = MODULES.length
  const ac = analysisCount ?? 0

  let status = 'empty'
  if (ac > 0) status = 'analyzed'
  else if (completedCount >= totalCount) status = 'complete'
  else if (completedCount > 0) status = 'partial'

  return {
    record_date: recordDate,
    completed_count: completedCount,
    total_count: totalCount,
    analysis_count: ac,
    status,
    cards,
  }
}

/** 获取整月日历状态 */
export async function getCalendar(month: string): Promise<{ month: string; days: CalendarDay[] }> {
  const { data, error } = await supabase
    .from('module_entries')
    .select('record_date, module_id, text_content, display_title, entry_assets(count)')
    .like('record_date', `${month}-%`)
    .order('record_date')

  if (error) throw error

  const { data: analyses } = await supabase
    .from('analyses')
    .select('record_date')
    .like('record_date', `${month}-%`)
    .in('status', [...COMPLETED_ANALYSIS_STATUSES])

  const days: Record<string, CalendarDay> = {}
  const totalCount = MODULES.length

  for (const row of data || []) {
    const r = row as unknown as {
      record_date: string
      text_content: string | null
      display_title: string | null
      entry_assets: { count: number }[]
    }
    const item = days[r.record_date] ?? {
      date: r.record_date,
      completed_count: 0,
      total_count: totalCount,
      analysis_count: 0,
      status: 'empty',
    }
    const imgCount = r.entry_assets?.[0]?.count ?? 0
    if ((r.text_content || '').trim() || (r.display_title || '').trim() || imgCount > 0) {
      item.completed_count += 1
    }
    days[r.record_date] = item
  }

  for (const row of analyses || []) {
    const date = (row as { record_date: string }).record_date
    const item = days[date] ?? {
      date,
      completed_count: 0,
      total_count: totalCount,
      analysis_count: 0,
      status: 'empty',
    }
    item.analysis_count += 1
    days[date] = item
  }

  for (const item of Object.values(days)) {
    if (item.analysis_count > 0) item.status = 'analyzed'
    else if (item.completed_count >= totalCount) item.status = 'complete'
    else if (item.completed_count > 0) item.status = 'partial'
  }

  return {
    month,
    days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/** 复制来源日期的模块内容到目标日期 */
export async function copyWorkspace(
  targetDate: string,
  sourceDate: string,
  moduleIds: number[],
  overwrite: boolean,
): Promise<{
  copied_module_ids: number[]
  skipped_module_ids: number[]
}> {
  await ensureEntries(targetDate)

  const { data: sources } = await supabase
    .from('module_entries')
    .select('*')
    .eq('record_date', sourceDate)
    .in('module_id', moduleIds)

  const sourceRows = (sources || []) as unknown as ModuleEntryRow[]
  const copied: number[] = []
  const skipped: number[] = []

  for (const moduleId of moduleIds) {
    const source = sourceRows.find((r) => r.module_id === moduleId)
    if (!source) {
      skipped.push(moduleId)
      continue
    }

    const sourceImgCount = await getEntryImageCount(source.id)
    if (!entryHasContent(source, sourceImgCount)) {
      skipped.push(moduleId)
      continue
    }

    const { data: target } = await supabase
      .from('module_entries')
      .select('*')
      .eq('record_date', targetDate)
      .eq('module_id', moduleId)
      .single()

    if (!target) {
      skipped.push(moduleId)
      continue
    }

    const targetRow = target as unknown as ModuleEntryRow
    const targetImgCount = await getEntryImageCount(targetRow.id)
    if (entryHasContent(targetRow, targetImgCount) && !overwrite) {
      skipped.push(moduleId)
      continue
    }

    await supabase
      .from('module_entries')
      .update({
        display_title: source.display_title,
        text_content: source.text_content,
        status: 'draft',
        period_start: source.period_start,
        period_end: source.period_end,
        revision: targetRow.revision + 1,
      })
      .eq('id', targetRow.id)

    // 复制图片关联
    await supabase.from('entry_assets').delete().eq('module_entry_id', targetRow.id)
    const { data: sourceAssets } = await supabase
      .from('entry_assets')
      .select('*')
      .eq('module_entry_id', source.id)
      .order('order_index')

    for (const ea of (sourceAssets || []) as unknown as EntryAssetRow[]) {
      await supabase.from('entry_assets').insert({
        module_entry_id: targetRow.id,
        asset_id: ea.asset_id,
        order_index: ea.order_index,
        caption: ea.caption,
      })
    }

    copied.push(moduleId)
  }

  return { copied_module_ids: copied, skipped_module_ids: skipped }
}
