export const queryKeys = {
    sessions: ['sessions'] as const,
    session: (sessionId: string) => ['session', sessionId] as const,
    messages: (sessionId: string) => ['messages', sessionId] as const,
    machines: ['machines'] as const,
    gitStatus: (sessionId: string) => ['git-status', sessionId] as const,
    sessionFiles: (sessionId: string, query: string) => ['session-files', sessionId, query] as const,
    sessionDirectory: (sessionId: string, path: string) => ['session-directory', sessionId, path] as const,
    sessionFile: (sessionId: string, path: string) => ['session-file', sessionId, path] as const,
    gitFileDiff: (sessionId: string, path: string, staged?: boolean) => [
        'git-file-diff',
        sessionId,
        path,
        staged ? 'staged' : 'unstaged'
    ] as const,
    slashCommands: (sessionId: string) => ['slash-commands', sessionId] as const,
    skills: (sessionId: string) => ['skills', sessionId] as const,
    codexSkills: (sessionId: string, forceReload: boolean) => ['codex-skills', sessionId, forceReload ? 'force' : 'cached'] as const,
    codexThread: (sessionId: string) => ['codex-thread', sessionId] as const,
    codexThreads: (sessionId: string, archived: boolean) => ['codex-threads', sessionId, archived ? 'archived' : 'active'] as const,
    codexConfig: (sessionId: string, includeLayers: boolean) => ['codex-config', sessionId, includeLayers ? 'layers' : 'effective'] as const,
    codexMcpStatus: (sessionId: string, cursor: string | null | undefined, limit: number | undefined) => [
        'codex-mcp-status',
        sessionId,
        cursor ?? null,
        limit ?? null
    ] as const,
}
