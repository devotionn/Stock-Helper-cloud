<template>
  <div class="page-container">
    <h1 class="page-title">分析结果</h1>

    <!-- 加载中 -->
    <div v-if="loading" class="loading">
      <div class="loading-spinner"></div>
      <div>正在加载...</div>
    </div>

    <template v-else-if="analysis">
      <!-- 返回按钮 -->
      <button class="btn btn-secondary mb-4" @click="goBack">← 返回组合分析</button>

      <!-- 分析中 -->
      <div v-if="analysis.status === 'running' || analysis.status === 'pending'" class="loading analyzing-loading">
        <div class="loading-spinner"></div>
        <div class="analyzing-text">AI正在分析中，请耐心等待...</div>
        <div class="analyzing-sub">分析可能需要30-120秒，页面将自动刷新结果</div>
      </div>

      <!-- 失败 -->
      <div v-else-if="analysis.status === 'failed'" class="card">
        <div class="analysis-warning">❌ 分析失败</div>
        <div class="analysis-section-content">
          {{ analysis.error_message || '分析过程中出现错误，请稍后重试' }}
        </div>
        <button class="btn btn-secondary mt-4" @click="goBack">返回重新分析</button>
      </div>

      <!-- 完成 -->
      <template v-else-if="analysis.status === 'completed' || analysis.status === 'completed_with_warning'">
        <!-- 免责声明 -->
        <div class="analysis-warning">⚠️ 本分析仅供参考，不构成投资建议</div>
        <div v-if="analysis.status === 'completed_with_warning'" class="analysis-warning">
          ⚠️ 结果格式可能不完整
        </div>

        <!-- 分析信息 -->
        <section class="card">
          <h2 class="section-title">分析信息</h2>
          <div class="info-row">
            <span class="info-label">使用模块：</span>
            <div class="info-value">
              <template v-for="(modId, idx) in analysis.combination" :key="modId">
                <span class="combo-step">
                  <span class="combo-order">{{ idx + 1 }}</span>
                  <span class="combo-name">{{ getModuleName(modId) }}</span>
                </span>
                <span v-if="idx < analysis.combination.length - 1" class="combo-arrow">-></span>
              </template>
            </div>
          </div>
          <div class="info-row">
            <span class="info-label">分析要求：</span>
            <div class="info-value">{{ analysis.analysis_request || '（未填写）' }}</div>
          </div>
          <div class="info-row">
            <span class="info-label">开始时间：</span>
            <div class="info-value">{{ formatTime(analysis.started_at || analysis.created_at) }}</div>
          </div>
          <div class="info-row">
            <span class="info-label">完成时间：</span>
            <div class="info-value">{{ formatTime(analysis.completed_at) }}</div>
          </div>
        </section>

        <!-- 分析结果 -->
        <section class="card">
          <h2 class="section-title">分析结果</h2>
          <div v-if="useRaw" class="analysis-section">
            <div class="analysis-section-title">原始结果</div>
            <div class="analysis-section-content">{{ analysis.raw_result || '暂无结果' }}</div>
          </div>
          <template v-else>
            <div v-for="key in ANALYSIS_SECTION_KEYS" :key="key" class="analysis-section">
              <div class="analysis-section-title">{{ key }}</div>
              <div class="analysis-section-content">{{ parsedResult?.[key] || '暂无内容' }}</div>
            </div>
          </template>
        </section>

        <!-- 保存到模块 -->
        <section class="card">
          <h2 class="section-title">保存到模块</h2>
          <p class="section-hint">将本次分析结果保存到对应模块，方便后续查看</p>
          <div class="flex gap-4 save-buttons">
            <button
              class="btn btn-success"
              :disabled="saving !== null"
              @click="saveToModule(9, 'AI复盘')"
            >
              {{ saving === 9 ? '保存中...' : '保存到AI复盘' }}
            </button>
            <button
              class="btn btn-success"
              :disabled="saving !== null"
              @click="saveToModule(11, '操作建议')"
            >
              {{ saving === 11 ? '保存中...' : '保存到操作建议' }}
            </button>
          </div>
        </section>
      </template>

      <!-- 未知状态 -->
      <div v-else class="card">
        <div class="analysis-warning">未知分析状态：{{ analysis.status }}</div>
        <button class="btn btn-secondary mt-4" @click="goBack">返回</button>
      </div>
    </template>

    <div v-else class="empty-state">未找到分析记录</div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAnalysis, useSaveToModule } from '@/queries/analysis'
import { ANALYSIS_SECTION_KEYS, MODULE_NAMES } from '@stock-helper/shared'
import { formatTime } from '@/utils/date'
import type { ToastType } from '@/types'

const route = useRoute()
const router = useRouter()
const id = computed<string>(() => route.params.id as string)
const showToast = inject<(msg: string, type?: ToastType) => void>('toast')!

const { data: analysis, isLoading: loading } = useAnalysis(id)
const saveMutation = useSaveToModule()

const saving = ref<number | null>(null)

const parsedResult = computed<Record<string, string> | null>(() => {
  const raw = analysis.value?.result_json
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return null
  }
})

const useRaw = computed<boolean>(() => parsedResult.value === null)

function buildResultText(): string {
  const parsed = parsedResult.value
  if (parsed) {
    return ANALYSIS_SECTION_KEYS.map((k) => `【${k}】\n${parsed[k] || ''}`).join('\n\n')
  }
  return analysis.value?.raw_result || ''
}

function getModuleName(modId: number): string {
  return MODULE_NAMES[modId] || `模块${modId}`
}

async function saveToModule(moduleId: number, label: string): Promise<void> {
  if (saving.value !== null) return
  saving.value = moduleId
  try {
    const text = buildResultText()
    await saveMutation.mutateAsync({
      analysisId: id.value,
      moduleId,
      content: text,
    })
    showToast(`已保存到${label}`, 'success')
  } catch {
    showToast(`保存到${label}失败`, 'error')
  } finally {
    saving.value = null
  }
}

function goBack(): void {
  router.push('/analysis')
}
</script>

<style scoped>
.section-title {
  font-size: var(--font-size-xl);
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--text);
}

.section-hint {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin-bottom: 20px;
}

.analyzing-loading {
  padding: 80px 20px;
}

.analyzing-text {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--text);
  margin-top: 16px;
  margin-bottom: 8px;
}

.analyzing-sub {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
}

.info-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: var(--font-size-base);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  flex-shrink: 0;
}

.info-value {
  flex: 1;
  color: var(--text);
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.combo-step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.combo-order {
  background: var(--primary);
  color: #fff;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
}

.combo-name {
  font-weight: 600;
}

.combo-arrow {
  margin: 0 8px;
  color: var(--text-secondary);
  font-size: 18px;
}

.save-buttons {
  flex-wrap: wrap;
}
</style>
