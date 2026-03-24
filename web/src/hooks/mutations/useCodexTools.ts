import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { CodexConfigBatchWriteParams, CodexConfigWriteValueParams } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useCodexTools(api: ApiClient | null, sessionId: string | null): {
    unarchiveThread: () => Promise<void>
    compactThread: () => Promise<void>
    reloadMcpConfig: () => Promise<void>
    writeConfigValue: (params: CodexConfigWriteValueParams) => Promise<void>
    batchWriteConfig: (params: CodexConfigBatchWriteParams) => Promise<void>
    isPending: boolean
} {
    const queryClient = useQueryClient()

    const invalidate = async () => {
        if (!sessionId) return
        await queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
        await queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        await queryClient.invalidateQueries({ queryKey: queryKeys.codexThread(sessionId) })
        await queryClient.invalidateQueries({ queryKey: queryKeys.codexThreads(sessionId, true) })
        await queryClient.invalidateQueries({ queryKey: queryKeys.codexThreads(sessionId, false) })
        await queryClient.invalidateQueries({ queryKey: queryKeys.codexMcpStatus(sessionId, null, undefined) })
        await queryClient.invalidateQueries({ queryKey: queryKeys.codexConfig(sessionId, false) })
        await queryClient.invalidateQueries({ queryKey: queryKeys.codexConfig(sessionId, true) })
        await queryClient.invalidateQueries({ queryKey: queryKeys.skills(sessionId) })
        await queryClient.invalidateQueries({ queryKey: queryKeys.codexSkills(sessionId, false) })
        await queryClient.invalidateQueries({ queryKey: queryKeys.codexSkills(sessionId, true) })
    }

    const unarchiveMutation = useMutation({
        mutationFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            await api.unarchiveCodexThread(sessionId)
        },
        onSuccess: () => void invalidate()
    })

    const compactMutation = useMutation({
        mutationFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            await api.compactCodexThread(sessionId)
        },
        onSuccess: () => void invalidate()
    })

    const reloadMutation = useMutation({
        mutationFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            await api.reloadCodexMcpConfig(sessionId)
        },
        onSuccess: () => void invalidate()
    })

    const writeConfigValueMutation = useMutation({
        mutationFn: async (params: CodexConfigWriteValueParams) => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            await api.writeCodexConfigValue(sessionId, params)
        },
        onSuccess: () => void invalidate()
    })

    const batchWriteConfigMutation = useMutation({
        mutationFn: async (params: CodexConfigBatchWriteParams) => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            await api.batchWriteCodexConfig(sessionId, params)
        },
        onSuccess: () => void invalidate()
    })

    return {
        unarchiveThread: unarchiveMutation.mutateAsync,
        compactThread: compactMutation.mutateAsync,
        reloadMcpConfig: reloadMutation.mutateAsync,
        writeConfigValue: writeConfigValueMutation.mutateAsync,
        batchWriteConfig: batchWriteConfigMutation.mutateAsync,
        isPending: (
            unarchiveMutation.isPending ||
            compactMutation.isPending ||
            reloadMutation.isPending ||
            writeConfigValueMutation.isPending ||
            batchWriteConfigMutation.isPending
        )
    }
}
