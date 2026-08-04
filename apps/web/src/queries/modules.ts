import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import * as modulesService from '@/services/modules'
import type { ModuleEntry, Asset } from '@/types'

export const moduleKeys = {
  detail: (date: string, moduleId: number) => ['modules', date, moduleId] as const,
  images: (date: string, moduleId: number) => ['modules', date, moduleId, 'images'] as const,
}

export function useModule(recordDate: Ref<string>, moduleId: Ref<number>) {
  return useQuery({
    queryKey: computed(() => moduleKeys.detail(recordDate.value, moduleId.value)),
    queryFn: (): Promise<ModuleEntry> =>
      modulesService.getModule(recordDate.value, moduleId.value),
    enabled: computed(() => !!recordDate.value && moduleId.value >= 0),
  })
}

export function useModuleImages(recordDate: Ref<string>, moduleId: Ref<number>) {
  return useQuery({
    queryKey: computed(() => moduleKeys.images(recordDate.value, moduleId.value)),
    queryFn: (): Promise<Asset[]> =>
      modulesService.getModuleImages(recordDate.value, moduleId.value),
    enabled: computed(() => !!recordDate.value && moduleId.value >= 0),
  })
}

export function useUpdateModule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      recordDate: string
      moduleId: number
      body: {
        text_content: string
        revision: number
        display_title: string
        period_start: string | null
        period_end: string | null
        status: string
      }
    }) => modulesService.updateModule(params.recordDate, params.moduleId, params.body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: moduleKeys.detail(variables.recordDate, variables.moduleId),
      })
      queryClient.invalidateQueries({
        queryKey: ['workspaces', variables.recordDate],
      })
    },
  })
}

export function useUpdateImageCaption() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      recordDate: string
      moduleId: number
      assetId: string
      caption: string
      orderIndex?: number
    }) =>
      modulesService.updateImageCaption(
        params.recordDate,
        params.moduleId,
        params.assetId,
        params.caption,
        params.orderIndex,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: moduleKeys.images(variables.recordDate, variables.moduleId),
      })
    },
  })
}

export function useReorderImages() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      recordDate: string
      moduleId: number
      assetIds: string[]
    }) => modulesService.reorderImages(params.recordDate, params.moduleId, params.assetIds),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: moduleKeys.images(variables.recordDate, variables.moduleId),
      })
    },
  })
}

export function useDeleteImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      recordDate: string
      moduleId: number
      assetId: string
    }) => modulesService.deleteImage(params.recordDate, params.moduleId, params.assetId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: moduleKeys.images(variables.recordDate, variables.moduleId),
      })
      queryClient.invalidateQueries({
        queryKey: ['workspaces', variables.recordDate],
      })
    },
  })
}
