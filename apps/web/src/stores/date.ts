import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { isValidRecordDate, today, formatRecordDate } from '@/utils/date'

const STORAGE_KEY = 'stock-helper-record-date'

export const useDateStore = defineStore('date', () => {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : ''
  const currentDate = ref(isValidRecordDate(stored) ? stored : today())

  const formattedCurrentDate = computed(() => formatRecordDate(currentDate.value))

  function setCurrentDate(value: string): boolean {
    if (!isValidRecordDate(value)) return false
    currentDate.value = value
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value)
    }
    return true
  }

  return { currentDate, formattedCurrentDate, setCurrentDate }
})
