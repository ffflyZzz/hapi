import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { CodexSkill, CodexSkillsEntry, SkillsResponse } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

function normalizeEntries(response: SkillsResponse | null | undefined): CodexSkillsEntry[] {
    if (!response || !('data' in response) || !Array.isArray(response.data)) {
        return []
    }

    return response.data.map((entry) => ({
        cwd: entry.cwd,
        skills: Array.isArray(entry.skills)
            ? entry.skills.map((skill): CodexSkill => ({
                name: skill.name,
                description: skill.description,
                path: skill.path,
                scope: skill.scope,
                enabled: skill.enabled,
                interface: skill.interface,
                dependencies: skill.dependencies
            }))
            : [],
        errors: Array.isArray(entry.errors) ? entry.errors : []
    }))
}

export function useCodexSkills(
    api: ApiClient | null,
    sessionId: string | null,
    options?: { forceReload?: boolean; enabled?: boolean }
): {
    entries: CodexSkillsEntry[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const resolvedSessionId = sessionId ?? 'unknown'
    const forceReload = options?.forceReload ?? false
    const enabled = (options?.enabled ?? true) && Boolean(api && sessionId)

    const query = useQuery({
        queryKey: queryKeys.codexSkills(resolvedSessionId, forceReload),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.getSkills(sessionId, { forceReload })
        },
        enabled
    })

    return {
        entries: normalizeEntries(query.data),
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Codex skills' : null,
        refetch: query.refetch
    }
}
