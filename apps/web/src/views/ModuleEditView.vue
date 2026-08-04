<template>
  <div class="page-container">
    <div class="edit-header">
      <button class="btn btn-secondary" @click="goBack">← 返回工作台</button>
      <div class="edit-heading">
        <h1 class="page-title">{{ moduleData?.module_name || '模块编辑' }}</h1>
        <div class="record-date-badge">{{ formattedRecordDate }}</div>
      </div>
      <span :class="['save-status', saveStatus]">{{ saveStatusText }}</span>
      <button class="btn btn-primary" :disabled="saving || loading" @click="manualSave">保存</button>
    </div>
    <div v-if="moduleData?.module_desc" class="module-desc-text">{{ moduleData.module_desc }}</div>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <div>正在加载模块内容...</div>
    </div>

    <template v-else>
      <div v-if="isStockModule" class="form-group metadata-card">
        <label class="form-label">股票名称 / 代码</label>
        <input
          v-model="displayTitle"
          class="form-input"
          placeholder="例如：宁德时代 300750"
        />
        <div class="field-hint">该名称只属于 {{ recordDate }}，不会影响其他日期。</div>
      </div>

      <div v-if="moduleId === STRATEGY_MODULE_ID" class="form-group metadata-card">
        <label class="form-label">策略有效期</label>
        <div class="period-row">
          <input v-model="periodStart" type="date" class="form-input" />
          <span>至</span>
          <input v-model="periodEnd" type="date" class="form-input" />
        </div>
        <div class="field-hint">用于说明本周策略适用范围，不改变当前投研日期。</div>
      </div>

      <div class="form-group">
        <label class="form-label">文字内容</label>
        <textarea
          v-model="textContent"
          class="form-textarea edit-textarea"
          placeholder="在此输入或粘贴文字内容..."
        ></textarea>
      </div>

      <div class="form-group">
        <label class="form-label">图片（支持上传或直接{{ pasteTip }}）</label>
        <div class="upload-row">
          <button class="btn btn-primary" :disabled="uploading" @click="triggerUpload">
            {{ uploading ? '上传中...' : '上传图片' }}
          </button>
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
            multiple
            style="display: none"
            @change="onFileChange"
          />
          <span class="text-secondary">支持 JPG/PNG/WebP/GIF/BMP，可多选，也可在此页面{{ pasteTip }}</span>
        </div>

        <div v-if="imageList.length" class="image-grid">
          <div v-for="(img, index) in imageList" :key="img.id" class="image-item">
            <div class="image-thumb">
              <img
                v-if="imageUrls[img.id]"
                :src="imageUrls[img.id]"
                alt="缩略图"
                @click="previewImage = img"
              />
              <button class="delete-btn" title="删除图片" @click.stop="confirmDelete(img)">×</button>
            </div>
            <div class="image-sort">
              <button class="btn btn-secondary btn-sm" :disabled="index === 0" @click="moveImage(index, -1)">
                ↑ 上移
              </button>
              <button
                class="btn btn-secondary btn-sm"
                :disabled="index === imageList.length - 1"
                @click="moveImage(index, 1)"
              >
                ↓ 下移
              </button>
            </div>
            <input
              v-model="img.caption"
              class="form-input image-caption"
              placeholder="图片说明"
              @change="saveCaption(img)"
            />
          </div>
        </div>
        <div v-else class="empty-state">
          暂无图片，点击上方"上传图片"按钮，或直接{{ pasteTip }}
        </div>
      </div>

      <div class="edit-footer">
        <span :class="['save-status', saveStatus]">{{ saveStatusText }}</span>
        <button class="btn btn-primary btn-lg" :disabled="saving" @click="manualSave">保存</button>
      </div>
    </template>

    <div v-if="previewImage" class="image-overlay" @click="previewImage = null">
      <img v-if="previewUrl" :src="previewUrl" alt="大图" />
      <div v-else class="loading-spinner"></div>
    </div>

    <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null">
      <div class="modal">
        <div class="modal-title">确认删除</div>
        <div class="modal-body">确定要删除这张图片吗？删除后将从 {{ recordDate }} 的当前模块移除。</div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="deleteTarget = null">取消</button>
          <button class="btn btn-danger" @click="doDelete">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDateStore } from '@/stores/date'
import { useModule, useModuleImages, useUpdateModule, useUpdateImageCaption, useReorderImages, useDeleteImage } from '@/queries/modules'
import { uploadImage, linkAssetToEntry, getSignedUrl } from '@/services/assets'
import { isValidRecordDate, formatRecordDate } from '@/utils/date'
import { STOCK_MODULE_IDS, STRATEGY_MODULE_ID } from '@stock-helper/shared'
import type { ToastType, Asset } from '@/types'

const props = defineProps<{ id: string | number }>()

const router = useRouter()
const route = useRoute()
const dateStore = useDateStore()
const moduleId = computed(() => Number(props.id))
const isStockModule = computed(() => (STOCK_MODULE_IDS as readonly number[]).includes(moduleId.value))
const recordDate = computed(() => dateStore.currentDate)
const formattedRecordDate = computed(() => formatRecordDate(recordDate.value))
const showToast = inject<(msg: string, type?: ToastType) => void>('toast')!

const { data: moduleData, isLoading: loading } = useModule(recordDate, moduleId)
const { data: images, refetch: refetchImages } = useModuleImages(recordDate, moduleId)
const updateMutation = useUpdateModule()
const captionMutation = useUpdateImageCaption()
const reorderMutation = useReorderImages()
const deleteMutation = useDeleteImage()

const isMac = navigator.platform.toUpperCase().includes('MAC')
const pasteTip = isMac ? '按 Command + V 粘贴截图' : '按 Ctrl + V 粘贴截图'

const textContent = ref('')
const displayTitle = ref('')
const periodStart = ref('')
const periodEnd = ref('')
const revision = ref(0)
const imageList = computed<Asset[]>(() => images.value ?? [])
const saving = ref(false)
const uploading = ref(false)
const saveStatus = ref<'saved' | 'saving' | 'unsaved'>('saved')
const previewImage = ref<Asset | null>(null)
const previewUrl = ref('')
const deleteTarget = ref<Asset | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const imageUrls = ref<Record<string, string>>({})
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let lastSavedState = ''

const saveStatusText = computed(() => {
  return { saved: '已自动保存', saving: '保存中...', unsaved: '未保存' }[saveStatus.value] || ''
})

function currentState(): string {
  return JSON.stringify({
    textContent: textContent.value,
    displayTitle: displayTitle.value,
    periodStart: periodStart.value,
    periodEnd: periodEnd.value,
  })
}

watch(moduleData, (data) => {
  if (!data) return
  textContent.value = data.text_content || ''
  displayTitle.value = data.display_title || ''
  periodStart.value = data.period_start || ''
  periodEnd.value = data.period_end || ''
  revision.value = data.revision
  lastSavedState = currentState()
  saveStatus.value = 'saved'
}, { immediate: true })

watch(imageList, async (imgs) => {
  const urls: Record<string, string> = {}
  await Promise.all(
    imgs.map(async (img) => {
      const path = img.thumbnail_path || img.storage_path
      if (path) {
        try {
          urls[img.id] = await getSignedUrl(path)
        } catch {
          // ignore
        }
      }
    }),
  )
  imageUrls.value = urls
}, { immediate: true })

watch(previewImage, async (img) => {
  previewUrl.value = ''
  if (!img) return
  try {
    previewUrl.value = await getSignedUrl(img.storage_path)
  } catch {
    showToast('图片加载失败', 'error')
    previewImage.value = null
  }
})

function scheduleAutoSave(): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => doSave(true), 1200)
}

watch([textContent, displayTitle, periodStart, periodEnd], () => {
  if (loading.value) return
  if (currentState() === lastSavedState) {
    saveStatus.value = 'saved'
    return
  }
  saveStatus.value = 'unsaved'
  scheduleAutoSave()
})

async function doSave(isAuto = false): Promise<void> {
  if (saving.value) {
    if (isAuto) scheduleAutoSave()
    return
  }
  if (currentState() === lastSavedState) {
    saveStatus.value = 'saved'
    if (!isAuto) showToast('内容无变化', 'warning')
    return
  }

  saving.value = true
  saveStatus.value = 'saving'
  try {
    const result = await updateMutation.mutateAsync({
      recordDate: recordDate.value,
      moduleId: moduleId.value,
      body: {
        text_content: textContent.value,
        revision: revision.value,
        display_title: displayTitle.value,
        period_start: periodStart.value || null,
        period_end: periodEnd.value || null,
        status: 'draft',
      },
    })
    revision.value = result.revision
    lastSavedState = currentState()
    saveStatus.value = 'saved'
    if (!isAuto) showToast('保存成功', 'success')
  } catch (err) {
    saveStatus.value = 'unsaved'
    const message = err instanceof Error ? err.message : '保存失败'
    if (message.includes('另一个页面') || message.includes('请先刷新')) {
      showToast('内容已在另一个页面更新，请刷新', 'error')
    } else {
      showToast(message, 'error')
      if (isAuto) scheduleAutoSave()
    }
  } finally {
    saving.value = false
  }
}

function manualSave(): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  doSave(false)
}

function triggerUpload(): void {
  fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files?.length) return
  await uploadFiles(Array.from(files))
  target.value = ''
}

async function uploadFiles(fileList: File[]): Promise<void> {
  uploading.value = true
  let successCount = 0
  const failedFiles: string[] = []
  const entryId = moduleData.value?.entry_id
  if (!entryId) {
    showToast('模块未加载，无法上传', 'error')
    uploading.value = false
    return
  }
  try {
    for (const file of fileList) {
      try {
        const asset = await uploadImage(file, recordDate.value, moduleId.value)
        await linkAssetToEntry(entryId, asset.id)
        successCount += 1
      } catch {
        failedFiles.push(file.name)
      }
    }
    if (successCount > 0) await refetchImages()
    let message = `成功上传${successCount}张`
    if (failedFiles.length) message += `，失败${failedFiles.length}张：${failedFiles.join('、')}`
    showToast(message, failedFiles.length ? 'warning' : 'success')
  } finally {
    uploading.value = false
  }
}

function handlePaste(event: ClipboardEvent): void {
  const items = event.clipboardData?.items
  if (!items) return
  const files: File[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type?.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (!files.length) return
  event.preventDefault()
  uploadFiles(files)
}

async function saveCaption(img: Asset): Promise<void> {
  try {
    await captionMutation.mutateAsync({
      recordDate: recordDate.value,
      moduleId: moduleId.value,
      assetId: img.id,
      caption: img.caption,
    })
    showToast('图片说明已保存', 'success')
  } catch {
    showToast('图片说明保存失败', 'error')
  }
}

async function moveImage(index: number, direction: number): Promise<void> {
  const list = imageList.value
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= list.length) return
  const reordered = [...list]
  ;[reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]]
  try {
    await reorderMutation.mutateAsync({
      recordDate: recordDate.value,
      moduleId: moduleId.value,
      assetIds: reordered.map((img) => img.id),
    })
    showToast('排序已更新', 'success')
  } catch {
    showToast('排序保存失败，请刷新后重试', 'error')
    await refetchImages()
  }
}

function confirmDelete(img: Asset): void {
  deleteTarget.value = img
}

async function doDelete(): Promise<void> {
  const image = deleteTarget.value
  deleteTarget.value = null
  if (!image) return
  try {
    await deleteMutation.mutateAsync({
      recordDate: recordDate.value,
      moduleId: moduleId.value,
      assetId: image.id,
    })
    showToast('图片已删除', 'success')
  } catch {
    showToast('删除失败', 'error')
  }
}

function goBack(): void {
  router.push({ path: '/', query: { date: recordDate.value } })
}

function handleBeforeUnload(): void {
  if (currentState() === lastSavedState || saving.value) return
  doSave(true)
}

onMounted(() => {
  const queryDate = String(route.query.date || '')
  if (isValidRecordDate(queryDate)) dateStore.setCurrentDate(queryDate)
  window.addEventListener('paste', handlePaste)
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  window.removeEventListener('paste', handlePaste)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  if (currentState() !== lastSavedState && !saving.value) doSave(true)
})
</script>

<style scoped>
.edit-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.edit-heading {
  flex: 1;
  min-width: 230px;
}
.edit-heading .page-title { margin-bottom: 4px; }
.record-date-badge {
  color: var(--primary);
  font-size: 17px;
  font-weight: 700;
}
.module-desc-text {
  color: var(--text-secondary);
  font-size: var(--font-size-lg);
  margin-bottom: 24px;
}
.metadata-card {
  background: #f7f9fc;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px;
}
.field-hint {
  color: var(--text-secondary);
  font-size: 15px;
  margin-top: 8px;
}
.period-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.period-row .form-input { max-width: 240px; }
.edit-textarea {
  font-size: 18px;
  min-height: 280px;
}
.upload-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.image-item {
  display: flex;
  flex-direction: column;
  width: 150px;
}
.image-caption {
  margin-top: 8px;
  font-size: 16px;
  padding: 8px 10px;
}
.image-sort {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.image-sort .btn { flex: 1; }
.save-status {
  font-size: var(--font-size-lg);
  font-weight: 600;
  white-space: nowrap;
}
.save-status.saved { color: var(--success); }
.save-status.saving { color: var(--text-secondary); }
.save-status.unsaved { color: var(--warning); }
.edit-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}
</style>
