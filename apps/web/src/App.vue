<template>
  <div id="app">
    <header v-if="auth.isAuthenticated" class="navbar">
      <div class="navbar-brand">股票分析助手</div>
      <div class="navbar-record-date">投研日期：{{ dateStore.formattedCurrentDate }}</div>
      <nav>
        <RouterLink :to="{ path: '/', query: { date: dateStore.currentDate } }" class="nav-link">工作台</RouterLink>
        <RouterLink :to="{ path: '/analysis', query: { date: dateStore.currentDate } }" class="nav-link">组合分析</RouterLink>
        <RouterLink to="/history" class="nav-link">历史记录</RouterLink>
        <RouterLink to="/settings" class="nav-link">系统设置</RouterLink>
      </nav>
    </header>
    <main>
      <RouterView />
    </main>
    <div v-if="toast.show" :class="['toast', `toast-${toast.type}`]">
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, provide, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDateStore } from '@/stores/date'
import type { ToastType } from '@/types'

const auth = useAuthStore()
const dateStore = useDateStore()

const toast = ref({ show: false, message: '', type: 'success' as ToastType })
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(message: string, type: ToastType = 'success') {
  toast.value = { show: true, message, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

provide('toast', showToast)

onMounted(() => {
  auth.init()
})

onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<style scoped>
.navbar-record-date {
  font-size: 16px;
  font-weight: 700;
  color: #eaf2ff;
  white-space: nowrap;
}
@media (max-width: 900px) {
  .navbar-record-date {
    width: 100%;
    order: 3;
  }
}
</style>
