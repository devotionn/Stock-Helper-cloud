<template>
  <div class="page-container">
    <h1 class="page-title">系统设置</h1>

    <div v-if="!settingsStore.loaded" class="loading">
      <div class="loading-spinner"></div>
      <div>正在加载设置...</div>
    </div>

    <template v-else>
      <!-- 显示设置 -->
      <div class="card">
        <h2 class="section-title">显示设置</h2>
        <div class="form-group">
          <label class="form-label">字体大小</label>
          <select class="form-select" v-model="settingsStore.fontSize">
            <option value="16">16px（较小）</option>
            <option value="18">18px（标准）</option>
            <option value="20">20px（较大）</option>
            <option value="22">22px（大）</option>
            <option value="24">24px（超大）</option>
          </select>
        </div>
        <div class="font-preview" :style="{ fontSize: settingsStore.fontSize + 'px' }">字体预览：股票分析助手</div>
        <button class="btn btn-primary mt-4" :disabled="saving" @click="saveFont">
          {{ saving ? '保存中...' : '保存显示设置' }}
        </button>
      </div>

      <!-- AI 配置说明 -->
      <div class="card">
        <h2 class="section-title">AI 配置说明</h2>
        <p class="config-hint">
          云端版的 AI 接口密钥由服务端环境变量统一配置，无需在前端输入或保存。
        </p>
        <p class="config-hint">
          如需修改 AI 模型或接口地址，请联系管理员在服务端环境变量中调整。
        </p>
      </div>

      <!-- 账户 -->
      <div class="card">
        <h2 class="section-title">账户</h2>
        <button class="btn btn-danger" @click="signOut">退出登录</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import type { ToastType } from '@/types'

const router = useRouter()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const showToast = inject<(msg: string, type?: ToastType) => void>('toast')!

const saving = ref<boolean>(false)

onMounted(() => {
  settingsStore.load()
})

async function saveFont(): Promise<void> {
  saving.value = true
  try {
    await settingsStore.saveFontSize(settingsStore.fontSize)
    showToast('显示设置保存成功', 'success')
  } catch (err) {
    showToast('保存失败：' + (err instanceof Error ? err.message : String(err)), 'error')
  } finally {
    saving.value = false
  }
}

async function signOut(): Promise<void> {
  try {
    await authStore.signOut()
    router.push('/login')
  } catch (err) {
    showToast('退出失败：' + (err instanceof Error ? err.message : String(err)), 'error')
  }
}
</script>

<style scoped>
.section-title {
  font-size: var(--font-size-xl);
  font-weight: 700;
  margin-bottom: 20px;
  color: var(--text);
}

.font-preview {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  color: var(--text);
  line-height: 1.8;
}

.config-hint {
  font-size: var(--font-size-base);
  line-height: 1.8;
  color: var(--text-secondary);
  margin-bottom: 12px;
}
</style>
