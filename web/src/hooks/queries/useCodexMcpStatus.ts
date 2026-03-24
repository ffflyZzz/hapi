import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { CodexMcpStatusResponse } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useCodexMcpStatus(
    api: ApiClient | null,
    sessionId: string | null,
    options?: { cursor?: string | null; limit?: number; enabled?: boolean }
): {
    data: CodexMcpStatusResponse | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const resolvedSessionId = sessionId ?? 'unknown'
    const cursor = options?.cursor ?? null
    const limit = options?.limit
    const enabled = (options?.enabled ?? true) && Boolean(api && sessionId)

    const query = useQuery({
        queryKey: queryKeys.codexMcpStatus(resolvedSessionId, cursor, limit),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.getCodexMcpStatus(sessionId, { cursor, limit })
        },
        enabled
    })

    return {
        data: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Codex MCP status' : null,
        refetch: query.refetch
    }
}
