/** 前端通用类型 */

export type ToastType = 'success' | 'error' | 'warning'

export interface ModuleEntry {
  entry_id: string
  record_date: string
  module_id: number
  module_name: string
  module_desc: string
  display_title: string
  text_content: string
  revision: number
  status: string
  period_start: string | null
  period_end: string | null
  updated_at: string
  image_count: number
  has_content: boolean
  text_summary: string
}

export interface ModuleCard {
  module_id: number
  module_name: string
  module_desc: string
  has_content: boolean
  text_summary: string
  image_count: number
  updated_at: string
  display_title: string
}

export interface Workspace {
  record_date: string
  completed_count: number
  total_count: number
  analysis_count: number
  status: string
  cards: ModuleEntry[]
}

export interface CalendarDay {
  date: string
  completed_count: number
  total_count: number
  analysis_count: number
  status: string
}

export interface Asset {
  id: string
  sha256: string
  original_filename: string | null
  storage_path: string
  ai_storage_path: string | null
  thumbnail_path: string | null
  file_size: number
  width: number | null
  height: number | null
  mime_type: string
  order_index: number
  caption: string
}

export interface Combination {
  id: string
  name: string
  module_ids: number[]
  created_at: string
  updated_at: string
}

export interface Analysis {
  id: string
  combination: number[]
  combination_name: string
  analysis_request: string
  record_date: string | null
  status: string
  result_json: string | null
  raw_result: string | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  saved_to_review: boolean
  saved_to_advice: boolean
  review_content: string
}

export interface AnalysisSnapshot {
  module_id: number
  order_index: number
  module_name: string
  display_title: string
  text_content: string
  images: { storage_path: string; thumbnail_path: string | null }[]
}

export interface AnalysisDetail {
  analysis: Analysis
  snapshots: AnalysisSnapshot[]
  notes: { id: string; note: string; created_at: string }[]
}

export interface HistoryItem {
  id: string
  combination: number[]
  combination_name: string
  analysis_request: string
  record_date: string
  status: string
  created_at: string
  completed_at: string | null
  modules: { module_id: number; module_name: string; display_title: string }[]
}

export interface HistoryList {
  total: number
  page: number
  page_size: number
  items: HistoryItem[]
}

export interface UserSettings {
  font_size: string
}

/** 数据库行类型（snake_case，与 Supabase 表结构一致） */
export interface ModuleEntryRow {
  id: string
  user_id: string
  module_id: number
  record_date: string
  display_title: string
  text_content: string
  status: string
  revision: number
  period_start: string | null
  period_end: string | null
  created_at: string
  updated_at: string
}

export interface AssetRow {
  id: string
  user_id: string
  sha256: string
  original_filename: string | null
  storage_path: string
  ai_storage_path: string | null
  thumbnail_path: string | null
  file_size: number
  width: number | null
  height: number | null
  mime_type: string
  format: string | null
  is_orphan: boolean
  orphan_since: string | null
  created_at: string
}

export interface EntryAssetRow {
  id: string
  module_entry_id: string
  asset_id: string
  order_index: number
  caption: string
}

export interface CombinationRow {
  id: string
  user_id: string
  name: string
  module_ids: number[]
  created_at: string
  updated_at: string
}

export interface AnalysisRow {
  id: string
  user_id: string
  combination: number[]
  combination_name: string
  analysis_request: string
  record_date: string | null
  status: string
  result_json: string | null
  raw_result: string | null
  error_message: string | null
  provider: string | null
  model: string | null
  token_usage: Record<string, unknown> | null
  saved_to_review: boolean
  saved_to_advice: boolean
  review_content: string
  created_at: string
  started_at: string | null
  completed_at: string | null
}
