import { supabase } from '@/lib/supabase'
import { MODULE_MAP } from '@stock-helper/shared'
import type { ModuleEntry, Asset, AssetRow, EntryAssetRow, ModuleEntryRow } from '@/types'

function textSummary(text: string, maxLen = 50): string {
  const normalized = (text || '').trim().replace(/\n/g, ' ')
  if (!normalized) return ''
  return normalized.slice(0, maxLen) + (normalized.length > maxLen ? '...' : '')
}

async function getEntryImageCount(entryId: string): Promise<number> {
  const { count } = await supabase
    .from('entry_assets')
    .select('*', { count: 'exact', head: true })
    .eq('module_entry_id', entryId)
  return count ?? 0
}

/** 获取指定日期的模块详情 */
export async function getModule(recordDate: string, moduleId: number): Promise<ModuleEntry> {
  const { data, error } = await supabase
    .from('module_entries')
    .select('*')
    .eq('record_date', recordDate)
    .eq('module_id', moduleId)
    .single()

  if (error) throw error

  const row = data as unknown as ModuleEntryRow
  const imageCount = await getEntryImageCount(row.id)
  const module = MODULE_MAP[row.module_id]!
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
    has_content: !!(row.text_content?.trim() || row.display_title?.trim() || imageCount > 0),
    text_summary: textSummary(row.text_content),
  }
}

/** 更新模块内容（带乐观锁） */
export async function updateModule(
  recordDate: string,
  moduleId: number,
  body: {
    text_content: string
    revision: number
    display_title: string
    period_start: string | null
    period_end: string | null
    status: string
  },
): Promise<{ revision: number }> {
  const { data, error } = await supabase
    .from('module_entries')
    .update({
      text_content: body.text_content,
      display_title: body.display_title,
      period_start: body.period_start,
      period_end: body.period_end,
      status: body.status,
      revision: body.revision + 1,
    })
    .eq('record_date', recordDate)
    .eq('module_id', moduleId)
    .eq('revision', body.revision)
    .select('revision')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('内容已在另一个页面更新，请先刷新')
    }
    throw error
  }

  return { revision: (data as { revision: number }).revision }
}

/** 获取模块的图片列表 */
export async function getModuleImages(recordDate: string, moduleId: number): Promise<Asset[]> {
  const { data: entry } = await supabase
    .from('module_entries')
    .select('id')
    .eq('record_date', recordDate)
    .eq('module_id', moduleId)
    .single()

  if (!entry) return []

  const { data, error } = await supabase
    .from('entry_assets')
    .select(`
      order_index,
      caption,
      assets (*)
    `)
    .eq('module_entry_id', (entry as { id: string }).id)
    .order('order_index')

  if (error) throw error

  return (data || []).map((row) => {
    const r = row as unknown as {
      order_index: number
      caption: string
      assets: AssetRow
    }
    const a = r.assets
    return {
      id: a.id,
      sha256: a.sha256,
      original_filename: a.original_filename,
      storage_path: a.storage_path,
      ai_storage_path: a.ai_storage_path,
      thumbnail_path: a.thumbnail_path,
      file_size: a.file_size,
      width: a.width,
      height: a.height,
      mime_type: a.mime_type,
      order_index: r.order_index,
      caption: r.caption,
    }
  })
}

/** 更新图片说明或排序 */
export async function updateImageCaption(
  recordDate: string,
  moduleId: number,
  assetId: string,
  caption: string,
  orderIndex?: number,
): Promise<void> {
  const { data: entry } = await supabase
    .from('module_entries')
    .select('id')
    .eq('record_date', recordDate)
    .eq('module_id', moduleId)
    .single()

  if (!entry) throw new Error('模块不存在')

  const update: Record<string, unknown> = { caption }
  if (orderIndex !== undefined) update.order_index = orderIndex

  const { error } = await supabase
    .from('entry_assets')
    .update(update)
    .eq('module_entry_id', (entry as { id: string }).id)
    .eq('asset_id', assetId)

  if (error) throw error
}

/** 重新排序图片 */
export async function reorderImages(
  recordDate: string,
  moduleId: number,
  assetIds: string[],
): Promise<void> {
  const { data: entry } = await supabase
    .from('module_entries')
    .select('id')
    .eq('record_date', recordDate)
    .eq('module_id', moduleId)
    .single()

  if (!entry) throw new Error('模块不存在')
  const entryId = (entry as { id: string }).id

  for (let i = 0; i < assetIds.length; i++) {
    await supabase
      .from('entry_assets')
      .update({ order_index: i + 1 })
      .eq('module_entry_id', entryId)
      .eq('asset_id', assetIds[i])
  }
}

/** 删除模块中的图片关联 */
export async function deleteImage(
  recordDate: string,
  moduleId: number,
  assetId: string,
): Promise<void> {
  const { data: entry } = await supabase
    .from('module_entries')
    .select('id')
    .eq('record_date', recordDate)
    .eq('module_id', moduleId)
    .single()

  if (!entry) throw new Error('模块不存在')

  const { error } = await supabase
    .from('entry_assets')
    .delete()
    .eq('module_entry_id', (entry as { id: string }).id)
    .eq('asset_id', assetId)

  if (error) throw error

  // 检查是否仍被引用
  const { count } = await supabase
    .from('entry_assets')
    .select('*', { count: 'exact', head: true })
    .eq('asset_id', assetId)

  if (count === 0) {
    await supabase
      .from('assets')
      .update({ is_orphan: true, orphan_since: new Date().toISOString() })
      .eq('id', assetId)
  }
}
