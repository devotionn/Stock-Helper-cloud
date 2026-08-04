import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import * as analysisService from '@/services/analysis'
import type { Analysis, AnalysisDetail } from '@/types'

export const analysisKeys = {
  detail: (id: string) => ['analyses', id] as const,
  full: (id: string) => ['analyses', id, 'detail'] as const,
}

/** 轮询分析状态 */
export function useAnalysis(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => analysisKeys.detail(id.value)),
    queryFn: (): Promise<Analysis> => analysisService.getAnalysis(id.value),
    enabled: computed(() => !!id.value),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'pending' || status === 'running') return 3000
      return false
    },
  })
}

export function useAnalysisDetail(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => analysisKeys.full(id.value)),
    queryFn: (): Promise<AnalysisDetail> => analysisService.getAnalysisDetail(id.value),
    enabled: computed(() => !!id.value),
  })
}

export function useCreateAnalysis() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      module_ids: number[]
      analysis_request: string
      combination_name: string
      record_date: string
    }) => analysisService.createAnalysis(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['workspaces', variables.record_date],
      })
    },
  })
}

export function useSaveToModule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      analysisId: string
      moduleId: number
      content: string
    }) => analysisService.saveToModule(params.analysisId, params.moduleId, params.content),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: analysisKeys.detail(variables.analysisId),
      })
    },
  })
}

export function useUpdateReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { analysisId: string; reviewContent: string }) =>
      analysisService.updateReview(params.analysisId, params.reviewContent),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: analysisKeys.detail(variables.analysisId),
      })
    },
  })
}
