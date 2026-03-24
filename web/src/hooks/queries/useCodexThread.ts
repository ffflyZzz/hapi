import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { CodexThreadResponse } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useCodexThread(
    api: ApiClient | null,
    sessionId: string | null,
    options?: { enabled?: boolean }
): {
    data: CodexThreadResponse | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const resolvedSessionId = sessionId ?? 'unknown'
    const enabled = (options?.enabled ?? true) && Boolean(api && sessionId)

    const query = useQuery({
        queryKey: queryKeys.codexThread(resolvedSessionId),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.getCodexThread(sessionId)
        },
        enabled
    })

    return {
        data: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Codex thread' : null,
        refetch: query.refetch
    }
}
