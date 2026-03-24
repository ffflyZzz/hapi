import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { CodexConfigResponse } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useCodexConfig(
    api: ApiClient | null,
    sessionId: string | null,
    options?: { includeLayers?: boolean; enabled?: boolean }
): {
    data: CodexConfigResponse | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const resolvedSessionId = sessionId ?? 'unknown'
    const includeLayers = options?.includeLayers ?? false
    const enabled = (options?.enabled ?? true) && Boolean(api && sessionId)

    const query = useQuery({
        queryKey: queryKeys.codexConfig(resolvedSessionId, includeLayers),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.getCodexConfig(sessionId, { includeLayers })
        },
        enabled
    })

    return {
        data: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Codex config' : null,
        refetch: query.refetch
    }
}
