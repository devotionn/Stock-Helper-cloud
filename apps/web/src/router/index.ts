import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDateStore } from '@/stores/date'
import { isValidRecordDate } from '@/utils/date'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/module/:id',
    name: 'module-edit',
    component: () => import('@/views/ModuleEditView.vue'),
    props: true,
  },
  {
    path: '/analysis',
    name: 'analysis',
    component: () => import('@/views/AnalysisView.vue'),
  },
  {
    path: '/result/:id',
    name: 'result',
    component: () => import('@/views/ResultView.vue'),
    props: true,
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('@/views/HistoryView.vue'),
  },
  {
    path: '/history/:id',
    name: 'history-detail',
    component: () => import('@/views/HistoryDetailView.vue'),
    props: true,
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
  },
] as const

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const routeDate = String(to.query.date || '')
  if (isValidRecordDate(routeDate)) {
    const dateStore = useDateStore()
    dateStore.setCurrentDate(routeDate)
  }

  const auth = useAuthStore()
  await auth.init()

  if (to.name === 'login' && auth.isAuthenticated) {
    const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/'
    return redirect
  }

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
})

export default router
