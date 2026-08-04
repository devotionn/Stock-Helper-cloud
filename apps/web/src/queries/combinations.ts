import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as combinationsService from '@/services/combinations'
import type { Combination } from '@/types'

export const combinationKeys = {
  all: ['combinations'] as const,
}

export function useCombinations() {
  return useQuery({
    queryKey: combinationKeys.all,
    queryFn: (): Promise<Combination[]> => combinationsService.listCombinations(),
  })
}

export function useCreateCombination() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { name: string; moduleIds: number[] }) =>
      combinationsService.createCombination(params.name, params.moduleIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: combinationKeys.all })
    },
  })
}

export function useDeleteCombination() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => combinationsService.deleteCombination(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: combinationKeys.all })
    },
  })
}
