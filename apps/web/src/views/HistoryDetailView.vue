<template>
  <div class="page-container">
    <div class="detail-toolbar">
      <button class="btn btn-secondary" @click="goBack">← 返回列表</button>
      <div class="toolbar-right">
        <button class="btn btn-primary" @click="reAnalyze">按原日期再次分析</button>
        <button class="btn btn-danger" @click="showDeleteModal = true">删除</button>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <div>正在加载详情...</div>
    </div>

    <template v-else-if="analysis">
      <div class="card">
        <h2 class="section-title">分析信息</h2>
        <div class="info-row record-date-row">
          <span class="info-label">投研日期：</span>
          <strong>{{ analysis.record_date || '未记录' }}</strong>
        </div>
        <div class="info-row">
          <span class="info-label">实际分析时间：</span>
          <span>{{ formatTime(analysis.created_at) }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">状态：</span>
          <span :class="['status-tag', statusClass(analysis.status)]">{{ statusText(analysis.status) }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">模块组合：</span>
          <div class="module-order">
            <span v-for="(moduleId, index) in analysis.combination" :key="`${moduleId}-${index}`" class="module-chip">
              <span class="module-chip-num">{{ index + 1 }}</span>
              {{ snapshotModuleName(moduleId) }}
            </span>
          </div>
        </div>
        <div class="info-row">
          <span class="info-label">分析要求：</span>
          <span>{{ analysis.analysis_request || '无' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">保存状态：</span>
          <div class="save-tags">
            <span :class="['save-tag', analysis.saved_to_review ? 'tag-saved' : 'tag-unsaved']">
              {{ analysis.saved_to_review ? '已保存到AI复盘' : '未保存到AI复盘' }}
            </span>
            <span :class="['save-tag', analysis.saved_to_advice ? 'tag-saved' : 'tag-unsaved']">
              {{ analysis.saved_to_advice ? '已保存到操作建议' : '未保存到操作建议' }}
            </span>
          </div>
        </div>
        <div v-if="analysis.error_message" class="error-message">
          错误信息：{{ analysis.error_message }}
        </div>
      </div>

      <div class="card">
        <h2 class="section-title">模块内容快照</h2>
        <p class="snapshot-hint">以下内容固定为本次分析当时的输入，后续修改工作台不会改变历史快照。</p>
        <div v-if="!sortedSnapshots.length" class="empty-state">暂无模块快照</div>
        <div v-for="snapshot in sortedSnapshots" :key="snapshot.order_index" class="snapshot-item">
          <div class="snapshot-header">
            <span class="snapshot-order">{{ snapshot.order_index + 1 }}</span>
            <div>
              <div class="snapshot-name">{{ snapshot.module_name }}</div>
              <div v-if="snapshot.display_title" class="snapshot-title">{{ snapshot.display_title }}</div>
            </div>
          </div>
          <div v-if="snapshot.text_content" class="snapshot-text">{{ snapshot.text_content }}</div>
          <div v-else class="text-secondary mb-4">该模块当时没有文字内容</div>
          <div v-if="snapshot.images?.length" class="image-grid">
            <div
              v-for="(image, index) in snapshot.images"
              :key="`${snapshot.module_id}-${index}`"
              class="image-thumb"
              @click="openPreview(image.storage_path)"
            >
              <img :src="signedUrls[image.thumbnail_path || image.storage_path]" :alt="snapshot.module_name" />
            </div>
          </div>
        </div>
      </div>

      <div v-if="analysisSections.length" class="card">
        <h2 class="section-title">AI分析结果</h2>
        <div v-for="section in analysisSections" :key="section.title" class="analysis-section">
          <div class="analysis-section-title">{{ section.title }}</div>
          <div class="analysis-section-content">{{ section.content }}</div>
        </div>
      </div>
      <div v-else-if="analysis.raw_result" class="card">
        <h2 class="section-title">AI分析原始结果</h2>
        <div class="analysis-section-content">{{ analysis.raw_result }}</div>
      </div>

      <div class="card">
        <h2 class="section-title">后续复盘</h2>
        <div class="form-group">
          <textarea v-model="reviewContent" class="form-textarea" placeholder="输入后续复盘内容..." rows="6"></textarea>
        </div>
        <button class="btn btn-primary" :disabled="savingReview" @click="saveReview">
          {{ savingReview ? '保存中...' : '保存复盘' }}
        </button>
      </div>

      <div class="analysis-warning">⚠️ 本分析仅供参考，不构成投资建议</div>

      <div class="card">
        <h2 class="section-title">客户备注</h2>
        <div v-if="notes.length" class="notes-list">
          <div v-for="note in notes" :key="note.id" class="note-item">
            <div class="note-text">{{ note.note }}</div>
            <div class="note-time">{{ formatTime(note.created_at) }}</div>
          </div>
        </div>
        <div v-else class="text-secondary mb-4">暂无备注</div>
        <div class="form-group">
          <label class="form-label">添加或修改备注</label>
          <textarea v-model="noteText" class="form-textarea" placeholder="输入备注内容..."></textarea>
        </div>
        <button class="btn btn-primary" :disabled="savingNote" @click="saveNote">
          {{ savingNote ? '保存中...' : '保存备注' }}
        </button>
      </div>
    </template>

    <div v-else class="empty-state">未找到该历史记录</div>

    <div v-if="previewImage" class="image-overlay" @click="previewImage = null">
      <img :src="previewImage" alt="预览" />
    </div>

    <div v-if="showDeleteModal" class="modal-overlay" @click.self="cancelDelete">
      <div class="modal">
        <div class="modal-title">确认删除</div>
        <div class="modal-body">
          <p class="mb-4">⚠️ 删除后将无法恢复，确定要删除这条历史记录吗？</p>
          <p>请输入 <strong>确认删除</strong> 以继续：</p>
          <input v-model="deleteConfirmText" class="form-input" placeholder="确认删除" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="cancelDelete">取消</button>
          <button
            class="btn btn-danger"
            :disabled="deleteConfirmText !== '确认删除' || deleting"
            @click="confirmDelete"
          >
            {{ deleting ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDateStore } from '@/stores/date'
import { useHistoryDetail, useUpdateNote, useDeleteHistory } from '@/queries/history'
import { useUpdateReview } from '@/queries/analysis'
import { getSignedUrl } from '@/services/assets'
import { MODULE_NAMES, formatTime } from '@/utils/date'
import type { ToastType } from '@/types'

const route = useRoute()
const router = useRouter()
const dateStore = useDateStore()
const showToast = inject<(msg: string, type?: ToastType) => void>('toast')!

const id = computed(() => route.params.id as string)
const { data: detail, isLoading: loading } = useHistoryDetail(id)
const noteMutation = useUpdateNote()
const reviewMutation = useUpdateReview()
const deleteMutation = useDeleteHistory()

const analysis = computed(() => detail.value?.analysis)
const snapshots = computed(() => detail.value?.snapshots ?? [])
const notes = computed(() => detail.value?.notes ?? [])

const sortedSnapshots = computed(() =>
  [...snapshots.value].sort((a, b) => a.order_index - b.order_index),
)

const analysisSections = computed(() => {
  if (!analysis.value?.result_json) return []
  try {
    const data = JSON.parse(analysis.value.result_json) as Record<string, string>
    const keys = ['信息汇总', '一致观点', '冲突观点', '关键判断', '风险提示', '信息不足之处', '操作参考建议']
    return keys.map((k) => ({ title: k, content: data[k] || '' })).filter((s) => s.content)
  } catch {
    return []
  }
})

const noteText = ref<string>('')
const reviewContent = ref<string>('')
const savingNote = computed(() => noteMutation.isPending.value)
const savingReview = computed(() => reviewMutation.isPending.value)

const showDeleteModal = ref<boolean>(false)
const deleteConfirmText = ref<string>('')
const deleting = computed(() => deleteMutation.isPending.value)

const previewImage = ref<string | null>(null)
const signedUrls = ref<Record<string, string>>({})

watch(
  detail,
  (data) => {
    if (data) {
      noteText.value = data.notes[0]?.note ?? ''
      reviewContent.value = data.analysis.review_content ?? ''
    }
  },
  { immediate: true },
)

watch(sortedSnapshots, async (snaps) => {
  for (const snap of snaps) {
    for (const img of snap.images) {
      const thumbPath = img.thumbnail_path || img.storage_path
      if (thumbPath && !signedUrls.value[thumbPath]) {
        try {
          signedUrls.value[thumbPath] = await getSignedUrl(thumbPath)
        } catch {
          // 单张图片加载失败不影响整体展示
        }
      }
    }
  }
})

function snapshotModuleName(moduleId: number): string {
  const snapshot = snapshots.value.find((item) => item.module_id === moduleId)
  if (snapshot?.display_title) return `${snapshot.module_name}（${snapshot.display_title}）`
  return snapshot?.module_name || MODULE_NAMES[moduleId] || `模块${moduleId}`
}

async function saveNote(): Promise<void> {
  if (savingNote.value) return
  try {
    await noteMutation.mutateAsync({ analysisId: id.value, note: noteText.value })
    showToast('备注保存成功', 'success')
  } catch (err) {
    showToast('保存失败：' + (err instanceof Error ? err.message : String(err)), 'error')
  }
}

async function saveReview(): Promise<void> {
  if (savingReview.value) return
  try {
    await reviewMutation.mutateAsync({ analysisId: id.value, reviewContent: reviewContent.value })
    showToast('复盘保存成功', 'success')
  } catch (err) {
    showToast('保存失败：' + (err instanceof Error ? err.message : String(err)), 'error')
  }
}

function reAnalyze(): void {
  if (!analysis.value?.combination?.length) {
    router.push('/analysis')
    return
  }
  if (analysis.value.record_date) {
    dateStore.setCurrentDate(analysis.value.record_date)
  }
  const query: Record<string, string> = {
    combination: analysis.value.combination.join(','),
    date: analysis.value.record_date || '',
  }
  if (analysis.value.analysis_request) {
    query.request = analysis.value.analysis_request
  }
  router.push({ path: '/analysis', query })
}

function goBack(): void {
  router.push('/history')
}

function cancelDelete(): void {
  showDeleteModal.value = false
  deleteConfirmText.value = ''
}

async function confirmDelete(): Promise<void> {
  if (deleteConfirmText.value !== '确认删除') return
  try {
    await deleteMutation.mutateAsync(id.value)
    showToast('删除成功', 'success')
    router.push('/history')
  } catch (err) {
    showToast('删除失败：' + (err instanceof Error ? err.message : String(err)), 'error')
  }
}

async function openPreview(storagePath: string): Promise<void> {
  try {
    previewImage.value = await getSignedUrl(storagePath)
  } catch (err) {
    showToast('加载图片失败：' + (err instanceof Error ? err.message : String(err)), 'error')
  }
}

function statusText(status: string): string {
  const map: Record<string, string> = {
    completed: '已完成',
    completed_with_warning: '已完成（格式提醒）',
    failed: '失败',
    running: '进行中',
    pending: '等待中',
    interrupted: '已中断',
  }
  return map[status] || status || '未知'
}

function statusClass(status: string): string {
  const map: Record<string, string> = {
    completed: 'status-completed',
    completed_with_warning: 'status-warning',
    failed: 'status-failed',
    running: 'status-running',
    pending: 'status-pending',
    interrupted: 'status-failed',
  }
  return map[status] || 'status-pending'
}
</script>

<style scoped>
.detail-toolbar,
.toolbar-right,
.module-order,
.save-tags {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.detail-toolbar {
  justify-content: space-between;
  margin-bottom: 24px;
}
.section-title {
  font-size: var(--font-size-xl);
  font-weight: 700;
  margin-bottom: 20px;
}
.info-row {
  display: flex;
  align-items: flex-start;
  font-size: var(--font-size-lg);
  line-height: 1.8;
  margin-bottom: 12px;
}
.info-label {
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}
.record-date-row strong { color: var(--primary); }
.module-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #e8f0fe;
  color: var(--primary);
  padding: 6px 14px;
  border-radius: 20px;
  font-weight: 600;
}
.module-chip-num,
.snapshot-order {
  background: var(--primary);
  color: #fff;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}
.module-chip-num { width: 26px; height: 26px; }
.snapshot-order { width: 36px; height: 36px; }
.status-tag,
.save-tag {
  display: inline-block;
  padding: 4px 14px;
  border-radius: 20px;
  font-weight: 600;
}
.status-completed,
.tag-saved { background: #e6f4ea; color: var(--success); }
.status-warning { background: #fff3cd; color: #7a5200; }
.status-failed { background: #fce8e6; color: var(--danger); }
.status-running { background: #e8f0fe; color: var(--primary); }
.status-pending,
.tag-unsaved { background: #f1f3f4; color: var(--text-secondary); }
.error-message {
  background: #fce8e6;
  color: var(--danger);
  padding: 12px 16px;
  border-radius: 8px;
  margin-top: 12px;
}
.snapshot-hint { color: var(--text-secondary); }
.snapshot-item {
  border: 2px solid var(--border);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 20px;
}
.snapshot-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.snapshot-name { font-size: var(--font-size-lg); font-weight: 700; }
.snapshot-title { color: var(--primary); font-weight: 700; margin-top: 3px; }
.snapshot-text,
.note-text,
.analysis-section-content {
  white-space: pre-wrap;
  line-height: 1.8;
}
.analysis-section { margin-bottom: 20px; }
.analysis-section-title { font-size: var(--font-size-lg); font-weight: 700; margin-bottom: 8px; }
.notes-list { margin-bottom: 20px; }
.note-item { background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
.note-time { color: var(--text-secondary); margin-top: 8px; }
@media (max-width: 768px) {
  .info-row { flex-direction: column; }
}
</style>
