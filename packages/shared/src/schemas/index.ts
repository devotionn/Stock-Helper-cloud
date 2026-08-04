/**
 * Zod Schemas - 前后端共享的数据校验模型
 * 从老版本 Pydantic schemas 迁移，同时供 Vercel Functions 和前端共用
 */
import { z } from 'zod'

// ---- 模块 ----

export const moduleEntryUpdateSchema = z.object({
  text_content: z.string(),
  revision: z.number().int(),
  display_title: z.string().default(''),
  period_start: z.string().nullable().default(null),
  period_end: z.string().nullable().default(null),
  status: z.string().default('draft'),
})

export const moduleEntrySchema = z.object({
  entry_id: z.string(),
  record_date: z.string(),
  module_id: z.number().int(),
  module_name: z.string(),
  module_desc: z.string(),
  display_title: z.string(),
  text_content: z.string(),
  revision: z.number().int(),
  status: z.string(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  updated_at: z.string(),
  image_count: z.number().int(),
  has_content: z.boolean(),
  text_summary: z.string(),
})

export const moduleCardSchema = z.object({
  module_id: z.number().int(),
  module_name: z.string(),
  module_desc: z.string(),
  has_content: z.boolean(),
  text_summary: z.string(),
  image_count: z.number().int(),
  updated_at: z.string(),
  display_title: z.string().optional().default(''),
})

export const workspaceSchema = z.object({
  record_date: z.string(),
  completed_count: z.number().int(),
  total_count: z.number().int(),
  analysis_count: z.number().int(),
  status: z.string(),
  cards: z.array(moduleEntrySchema),
})

export const calendarDaySchema = z.object({
  date: z.string(),
  completed_count: z.number().int(),
  total_count: z.number().int(),
  analysis_count: z.number().int(),
  status: z.string(),
})

export const calendarSchema = z.object({
  month: z.string(),
  days: z.array(calendarDaySchema),
})

// ---- 图片 ----

export const assetSchema = z.object({
  id: z.string(),
  sha256: z.string(),
  original_filename: z.string().nullable(),
  storage_path: z.string(),
  ai_storage_path: z.string().nullable(),
  thumbnail_path: z.string().nullable(),
  file_size: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  mime_type: z.string(),
  order_index: z.number().int(),
  caption: z.string().default(''),
})

export const assetCaptionUpdateSchema = z.object({
  caption: z.string().default(''),
  order_index: z.number().int().nullable().optional(),
})

// ---- 组合 ----

export const combinationCreateSchema = z.object({
  name: z.string().min(1, '组合名称不能为空'),
  module_ids: z.array(z.number().int()).min(1, '至少选择一个模块'),
})

export const combinationSchema = z.object({
  id: z.string(),
  name: z.string(),
  module_ids: z.array(z.number().int()),
  created_at: z.string(),
  updated_at: z.string(),
})

// ---- 分析 ----

export const analysisCreateSchema = z.object({
  module_ids: z.array(z.number().int()).min(1, '请至少选择一个模块'),
  analysis_request: z.string().default(''),
  combination_name: z.string().default(''),
  record_date: z.string().nullable().default(null),
})

/**
 * AI 分析结果结构化 Schema
 * 与老版本 SYSTEM_PROMPT 中的 7 个部分完全对应
 */
export const analysisResultSchema = z.object({
  信息汇总: z.string(),
  一致观点: z.string(),
  冲突观点: z.string(),
  关键判断: z.string(),
  风险提示: z.string(),
  信息不足之处: z.string(),
  操作参考建议: z.string(),
})

export const analysisSchema = z.object({
  id: z.string(),
  combination: z.array(z.number().int()),
  combination_name: z.string(),
  analysis_request: z.string(),
  record_date: z.string().nullable(),
  status: z.string(),
  result_json: z.string().nullable(),
  raw_result: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  saved_to_review: z.boolean(),
  saved_to_advice: z.boolean(),
  review_content: z.string(),
})

export const analysisSnapshotSchema = z.object({
  module_id: z.number().int(),
  order_index: z.number().int(),
  module_name: z.string(),
  display_title: z.string(),
  text_content: z.string(),
  images: z.array(
    z.object({
      relative_path: z.string(),
      thumbnail_path: z.string().nullable(),
    }),
  ),
})

export const analysisDetailSchema = z.object({
  analysis: analysisSchema,
  snapshots: z.array(analysisSnapshotSchema),
  notes: z.array(
    z.object({
      id: z.string(),
      note: z.string(),
      created_at: z.string(),
    }),
  ),
})

export const saveToModuleSchema = z.object({
  analysis_id: z.string(),
  module_id: z.number().int(),
  content: z.string(),
})

// ---- 历史 ----

export const historyQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  combination_name: z.string().optional(),
  stock_name: z.string().optional(),
  module_id: z.number().int().optional(),
  keyword: z.string().optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(20),
})

export const historyItemSchema = z.object({
  id: z.string(),
  combination: z.array(z.number().int()),
  combination_name: z.string(),
  analysis_request: z.string(),
  record_date: z.string(),
  status: z.string(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  modules: z.array(
    z.object({
      module_id: z.number().int(),
      module_name: z.string(),
      display_title: z.string(),
    }),
  ),
})

export const historyListSchema = z.object({
  total: z.number().int(),
  page: z.number().int(),
  page_size: z.number().int(),
  items: z.array(historyItemSchema),
})

// ---- 设置 ----

export const userSettingsSchema = z.object({
  font_size: z.string().default('18'),
})

// ---- 复制工作区 ----

export const copyWorkspaceSchema = z.object({
  source_date: z.string(),
  module_ids: z.array(z.number().int()),
  overwrite: z.boolean().default(false),
})
