import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import * as workspacesService from '@/services/workspaces'
import type { Workspace, CalendarDay } from '@/types'

export const workspaceKeys = {
  all: ['workspaces'] as const,
  detail: (date: string) => ['workspaces', date] as const,
  calendar: (month: string) => ['workspaces', 'calendar', month] as const,
}

export function useWorkspace(recordDate: Ref<string>) {
  return useQuery({
    queryKey: computed(() => workspaceKeys.detail(recordDate.value)),
    queryFn: () => workspacesService.getWorkspace(recordDate.value),
    enabled: computed(() => !!recordDate.value),
  })
}

export function useCalendar(month: Ref<string>) {
  return useQuery({
    queryKey: computed(() => workspaceKeys.calendar(month.value)),
    queryFn: async (): Promise<{ month: string; days: CalendarDay[] }> =>
      workspacesService.getCalendar(month.value),
    enabled: computed(() => !!month.value),
  })
}

export function useCopyWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      targetDate: string
      sourceDate: string
      moduleIds: number[]
      overwrite: boolean
    }) =>
      workspacesService.copyWorkspace(
        params.targetDate,
        params.sourceDate,
        params.moduleIds,
        params.overwrite,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(variables.targetDate) })
      queryClient.invalidateQueries({ queryKey: workspaceKeys.calendar(variables.targetDate.slice(0, 7)) })
    },
  })
}
