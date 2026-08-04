/**
 * 日期工具 - 从老版本 dateContext.js 迁移为 TypeScript
 */

function localToday(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isValidRecordDate(value: unknown): value is string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const [year, month, day] = String(value).split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  )
}

export function today(): string {
  return localToday()
}

export function formatRecordDate(value: string): string {
  if (!isValidRecordDate(value)) return value || ''
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${year}年${month}月${day}日 ${weekdays[parsed.getDay()]}`
}

export function shiftRecordDate(value: string, days: number): string {
  const base = isValidRecordDate(value) ? value : localToday()
  const [year, month, day] = base.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  parsed.setDate(parsed.getDate() + days)
  const resultYear = parsed.getFullYear()
  const resultMonth = String(parsed.getMonth() + 1).padStart(2, '0')
  const resultDay = String(parsed.getDate()).padStart(2, '0')
  return `${resultYear}-${resultMonth}-${resultDay}`
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

/** 生成 Storage 路径：{user_id}/{record_date}/{module_id}/{uuid}.{ext} */
export function buildStoragePath(
  userId: string,
  recordDate: string,
  moduleId: number,
  ext: string,
): string {
  const uuid = crypto.randomUUID()
  return `${userId}/${recordDate}/${moduleId}/${uuid}.${ext}`
}

/** 将文件扩展名映射为 Storage 路径用的扩展名 */
export function fileExtension(format: string): string {
  return format === 'jpeg' ? 'jpg' : format
}

export { MODULE_NAMES } from '@stock-helper/shared'
