import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { CodexThreadListResponse } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useCodexThreads(
    api: ApiClient | null,
    sessionId: string | null,
    options?: { archived?: boolean; cursor?: string | null; limit?: number; enabled?: boolean }
): {
    data: CodexThreadListResponse | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const resolvedSessionId = sessionId ?? 'unknown'
    const archived = options?.archived ?? false
    const cursor = options?.cursor ?? null
    const limit = options?.limit
    const enabled = (options?.enabled ?? true) && Boolean(api && sessionId)

    const query = useQuery({
        queryKey: [...queryKeys.codexThreads(resolvedSessionId, archived), cursor ?? null, limit ?? null],
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.getCodexThreads(sessionId, { archived, cursor, limit })
        },
        enabled
    })

    return {
        data: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Codex thread history' : null,
        refetch: query.refetch
    }
}
