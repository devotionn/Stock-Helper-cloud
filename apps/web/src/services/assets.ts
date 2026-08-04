import { supabase } from '@/lib/supabase'
import { STORAGE_BUCKET } from '@stock-helper/shared'
import { buildStoragePath, fileExtension } from '@/utils/date'
import type { Asset, AssetRow } from '@/types'

/**
 * 图片上传服务
 * 流程：浏览器直接上传到 Supabase Storage -> 写入 assets 元数据 -> 创建 entry_assets 关联
 */
export async function uploadImage(
  file: File,
  recordDate: string,
  moduleId: number,
): Promise<Asset> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')

  // 计算 sha256
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const sha256 = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // 检查是否已存在相同 hash 的 asset
  const { data: existing } = await supabase
    .from('assets')
    .select('*')
    .eq('user_id', user.id)
    .eq('sha256', sha256)
    .maybeSingle()

  if (existing) {
    const row = existing as unknown as AssetRow
    return mapAsset(row, 0, '')
  }

  // 获取图片尺寸
  const dimensions = await getImageDimensions(file)
  const format = file.type.split('/')[1] || 'jpeg'
  const ext = fileExtension(format)
  const storagePath = buildStoragePath(user.id, recordDate, moduleId, ext)

  // 上传到 Storage
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) throw uploadError

  // 写入 assets 元数据
  const { data: assetData, error: assetError } = await supabase
    .from('assets')
    .insert({
      user_id: user.id,
      sha256,
      original_filename: file.name,
      storage_path: storagePath,
      file_size: file.size,
      width: dimensions.width,
      height: dimensions.height,
      mime_type: file.type,
      format,
    })
    .select('*')
    .single()

  if (assetError) throw assetError

  return mapAsset(assetData as unknown as AssetRow, 0, '')
}

/** 创建图片与模块条目的关联 */
export async function linkAssetToEntry(
  entryId: string,
  assetId: string,
): Promise<number> {
  const { data: existing } = await supabase
    .from('entry_assets')
    .select('order_index')
    .eq('module_entry_id', entryId)
    .eq('asset_id', assetId)
    .maybeSingle()

  if (existing) {
    return (existing as { order_index: number }).order_index
  }

  const { data: maxRow } = await supabase
    .from('entry_assets')
    .select('order_index')
    .eq('module_entry_id', entryId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (maxRow as { order_index: number } | null)?.order_index
    ? (maxRow as { order_index: number }).order_index + 1
    : 1

  const { error } = await supabase.from('entry_assets').insert({
    module_entry_id: entryId,
    asset_id: assetId,
    order_index: nextOrder,
    caption: '',
  })

  if (error) throw error
  return nextOrder
}

/** 获取图片的签名 URL */
export async function getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresIn)

  if (error) throw error
  return data.signedUrl
}

/** 获取公共 URL（仅用于公开 bucket，私有 bucket 需用签名 URL） */
export function getPublicUrl(storagePath: string): string {
  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath)
  return data.publicUrl
}

function mapAsset(row: AssetRow, orderIndex: number, caption: string): Asset {
  return {
    id: row.id,
    sha256: row.sha256,
    original_filename: row.original_filename,
    storage_path: row.storage_path,
    ai_storage_path: row.ai_storage_path,
    thumbnail_path: row.thumbnail_path,
    file_size: row.file_size,
    width: row.width,
    height: row.height,
    mime_type: row.mime_type,
    order_index: orderIndex,
    caption,
  }
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: 0, height: 0 })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}
