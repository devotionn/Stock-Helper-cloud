<template>
  <div class="login-container">
    <div class="login-card">
      <h1 class="login-title">股票分析助手</h1>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">账号</label>
          <input v-model="email" type="email" class="form-input" placeholder="请输入邮箱" required />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input v-model="password" type="password" class="form-input" placeholder="请输入密码" required />
        </div>
        <div v-if="error" class="text-danger mb-4">{{ error }}</div>
        <button type="submit" class="btn btn-primary w-full" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref<string>('')
const password = ref<string>('')
const loading = ref<boolean>(false)
const error = ref<string>('')

async function handleLogin(): Promise<void> {
  error.value = ''
  loading.value = true
  try {
    await auth.signIn(email.value, password.value)
    const redirect =
      typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.push(redirect)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '登录失败'
  } finally {
    loading.value = false
  }
}
</script>
