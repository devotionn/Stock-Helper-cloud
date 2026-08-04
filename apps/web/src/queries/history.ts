import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import * as historyService from '@/services/history'
import type { HistoryList, AnalysisDetail } from '@/types'

export const historyKeys = {
  list: (params: Record<string, unknown>) => ['history', params] as const,
  detail: (id: string) => ['history', id, 'detail'] as const,
}

export function useHistoryList(params: Ref<Record<string, unknown>>) {
  return useQuery({
    queryKey: computed(() => historyKeys.list(params.value)),
    queryFn: (): Promise<HistoryList> =>
      historyService.listHistory({
        date_from: params.value.date_from as string | undefined,
        date_to: params.value.date_to as string | undefined,
        combination_name: params.value.combination_name as string | undefined,
        stock_name: params.value.stock_name as string | undefined,
        module_id: params.value.module_id as number | undefined,
        keyword: params.value.keyword as string | undefined,
        page: (params.value.page as number) || 1,
        page_size: (params.value.page_size as number) || 10,
      }),
  })
}

export function useHistoryDetail(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => historyKeys.detail(id.value)),
    queryFn: (): Promise<AnalysisDetail> => historyService.getHistoryDetail(id.value),
    enabled: computed(() => !!id.value),
  })
}

export function useUpdateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { analysisId: string; note: string }) =>
      historyService.updateNote(params.analysisId, params.note),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: historyKeys.detail(variables.analysisId),
      })
    },
  })
}

export function useDeleteHistory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => historyService.deleteHistory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] })
    },
  })
}
