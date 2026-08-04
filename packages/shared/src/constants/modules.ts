/**
 * 12 个投研模块定义
 * 业务模型与老版本完全一致，从 D:\code\Stock-Helper\backend\app\config.py 迁移
 */

export interface ModuleDefinition {
  id: number
  name: string
  desc: string
}

export const MODULES: readonly ModuleDefinition[] = [
  { id: 0, name: '一周策略', desc: '本周整体操作思路、仓位安排、重点关注方向' },
  { id: 1, name: '股票1', desc: '第一只关注股票的相关资料' },
  { id: 2, name: '股票2', desc: '第二只关注股票的相关资料' },
  { id: 3, name: '股票3', desc: '第三只关注股票的相关资料' },
  { id: 4, name: '股票4', desc: '第四只关注股票的相关资料' },
  { id: 5, name: '技术派观点', desc: '技术分析相关观点、指标解读、图形分析' },
  { id: 6, name: '钱说观点', desc: '特定信息来源的观点记录' },
  { id: 7, name: '大盘走势', desc: '大盘指数走势、宏观市场情况' },
  { id: 8, name: '反向操作', desc: '反向思维、风险提示、对立观点' },
  { id: 9, name: 'AI复盘', desc: '保存历史分析后的复盘内容' },
  { id: 10, name: '行业板块', desc: '行业和板块相关资料' },
  { id: 11, name: '操作建议', desc: '保存AI生成或客户修改后的操作参考' },
] as const

export const MODULE_MAP: Readonly<Record<number, ModuleDefinition>> = Object.fromEntries(
  MODULES.map((m) => [m.id, m]),
)

export const MODULE_NAMES = MODULES.map((m) => m.name)

/** 股票模块 ID 范围（1-4），用于判断是否显示股票名称输入框 */
export const STOCK_MODULE_IDS = [1, 2, 3, 4] as const

/** 策略模块 ID（0），用于判断是否显示策略有效期 */
export const STRATEGY_MODULE_ID = 0

/** AI 复盘模块 ID（9） */
export const REVIEW_MODULE_ID = 9

/** 操作建议模块 ID（11） */
export const ADVICE_MODULE_ID = 11

/** 复制上一日时默认包含的模块（不含 AI 复盘和操作建议） */
export const DEFAULT_COPY_MODULE_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10] as const

/** 可保存分析结果的模块 ID */
export const SAVEABLE_MODULE_IDS = [REVIEW_MODULE_ID, ADVICE_MODULE_ID] as const

/** 分析状态 */
export const ANALYSIS_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  COMPLETED_WITH_WARNING: 'completed_with_warning',
  FAILED: 'failed',
  INTERRUPTED: 'interrupted',
} as const

/** 已完成的分析状态（用于日历和工作台统计） */
export const COMPLETED_ANALYSIS_STATUSES = [
  ANALYSIS_STATUS.COMPLETED,
  ANALYSIS_STATUS.COMPLETED_WITH_WARNING,
] as const

/** 工作台状态 */
export const WORKSPACE_STATUS = {
  EMPTY: 'empty',
  PARTIAL: 'partial',
  COMPLETE: 'complete',
  ANALYZED: 'analyzed',
} as const

/** AI 分析结果 7 个部分的键名 */
export const ANALYSIS_SECTION_KEYS = [
  '信息汇总',
  '一致观点',
  '冲突观点',
  '关键判断',
  '风险提示',
  '信息不足之处',
  '操作参考建议',
] as const

/** 图片配置 */
export const IMAGE_CONFIG = {
  MAX_SIZE: 20 * 1024 * 1024, // 20MB
  MAX_DIMENSION: 8000,
  MAX_TOTAL_PIXELS: 50_000_000,
  THUMBNAIL_SIZE: 300,
  AI_MAX_IMAGES: 16,
  AI_IMAGE_MAX_LONG_EDGE: 2048,
  AI_IMAGE_QUALITY: 85,
  ALLOWED_TYPES: ['jpeg', 'png', 'webp', 'gif', 'bmp'] as readonly string[],
} as const

/** Storage bucket 名称 */
export const STORAGE_BUCKET = 'stock-helper-assets'
