import type {
    DecryptedMessage as ProtocolDecryptedMessage,
    Session,
    SessionSummary,
    SyncEvent as ProtocolSyncEvent,
    WorktreeMetadata
} from '@hapi/protocol/types'

export type {
    AgentState,
    AttachmentMetadata,
    CodexCollaborationMode,
    PermissionMode,
    Session,
    SessionSummary,
    SessionSummaryMetadata,
    TeamMember,
    TeamMessage,
    TeamState,
    TeamTask,
    TodoItem,
    WorktreeMetadata
} from '@hapi/protocol/types'

export type SessionMetadataSummary = {
    path: string
    host: string
    version?: string
    name?: string
    os?: string
    summary?: { text: string; updatedAt: number }
    machineId?: string
    codexSessionId?: string
    lifecycleState?: string
    archivedBy?: string
    archiveReason?: string
    tools?: string[]
    flavor?: string | null
    worktree?: WorktreeMetadata
}

export type MessageStatus = 'sending' | 'sent' | 'failed'

export type DecryptedMessage = ProtocolDecryptedMessage & {
    status?: MessageStatus
    originalText?: string
}

export type RunnerState = {
    status?: string
    pid?: number
    httpPort?: number
    startedAt?: number
    shutdownRequestedAt?: number
    shutdownSource?: string
    lastSpawnError?: {
        message: string
        pid?: number
        exitCode?: number | null
        signal?: string | null
        at: number
    } | null
}

export type Machine = {
    id: string
    active: boolean
    metadata: {
        host: string
        platform: string
        happyCliVersion: string
        displayName?: string
    } | null
    runnerState?: RunnerState | null
}

export type AuthResponse = {
    token: string
    user: {
        id: number
        username?: string
        firstName?: string
        lastName?: string
    }
}

export type SessionsResponse = { sessions: SessionSummary[] }
export type SessionResponse = { session: Session }
export type MessagesResponse = {
    messages: DecryptedMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
    }
}

export type MachinesResponse = { machines: Machine[] }
export type MachinePathsExistsResponse = { exists: Record<string, boolean> }

export type SpawnResponse =
    | { type: 'success'; sessionId: string }
    | { type: 'error'; message: string }

export type GitCommandResponse = {
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
}

export type FileSearchItem = {
    fileName: string
    filePath: string
    fullPath: string
    fileType: 'file' | 'folder'
}

export type FileSearchResponse = {
    success: boolean
    files?: FileSearchItem[]
    error?: string
}

export type DirectoryEntry = {
    name: string
    type: 'file' | 'directory' | 'other'
    size?: number
    modified?: number
}

export type ListDirectoryResponse = {
    success: boolean
    entries?: DirectoryEntry[]
    error?: string
}

export type FileReadResponse = {
    success: boolean
    content?: string
    error?: string
}

export type UploadFileResponse = {
    success: boolean
    path?: string
    error?: string
}

export type DeleteUploadResponse = {
    success: boolean
    error?: string
}

export type GitFileStatus = {
    fileName: string
    filePath: string
    fullPath: string
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'
    isStaged: boolean
    linesAdded: number
    linesRemoved: number
    oldPath?: string
}

export type GitStatusFiles = {
    stagedFiles: GitFileStatus[]
    unstagedFiles: GitFileStatus[]
    branch: string | null
    totalStaged: number
    totalUnstaged: number
}

export type SlashCommand = {
    name: string
    description?: string
    source: 'builtin' | 'user' | 'plugin' | 'project'
    content?: string  // Expanded content for Codex user prompts
    pluginName?: string
}

export type SlashCommandsResponse = {
    success: boolean
    commands?: SlashCommand[]
    error?: string
}

export type SkillSummary = {
    name: string
    description?: string
}

export type LegacySkillsResponse = {
    success: boolean
    skills?: SkillSummary[]
    error?: string
}

export type CodexSkillDependency = {
    type?: string
    value?: string
    description?: string
    transport?: string
    url?: string
}

export type CodexSkill = {
    name: string
    description?: string
    path?: string
    scope?: string
    enabled?: boolean
    interface?: {
        displayName?: string
        shortDescription?: string
    }
    dependencies?: {
        tools?: CodexSkillDependency[]
    }
}

export type CodexSkillsEntry = {
    cwd?: string
    skills?: CodexSkill[]
    errors?: unknown[]
}

export type CodexSkillsResponse = {
    data?: CodexSkillsEntry[]
    error?: string
}

export type SkillsResponse = LegacySkillsResponse | CodexSkillsResponse

export type CodexThreadResponse = {
    thread?: Record<string, unknown>
}

export type CodexThreadListResponse = {
    data?: Array<Record<string, unknown>>
    nextCursor?: string | null
}

export type CodexConfigResponse = {
    config?: Record<string, unknown>
    origins?: Record<string, unknown>
}

export type CodexConfigWriteValueParams = {
    keyPath: string
    value: unknown
    mergeStrategy?: string
}

export type CodexConfigBatchWriteEdit = {
    keyPath: string
    value: unknown
    mergeStrategy?: string
}

export type CodexConfigBatchWriteParams = {
    edits: CodexConfigBatchWriteEdit[]
}

export type CodexMcpStatusResponse = {
    data?: Array<Record<string, unknown>>
    nextCursor?: string | null
}

export type PushSubscriptionKeys = {
    p256dh: string
    auth: string
}

export type PushSubscriptionPayload = {
    endpoint: string
    keys: PushSubscriptionKeys
}

export type PushUnsubscribePayload = {
    endpoint: string
}

export type PushVapidPublicKeyResponse = {
    publicKey: string
}

export type VisibilityPayload = {
    subscriptionId: string
    visibility: 'visible' | 'hidden'
}

export type SyncEvent = ProtocolSyncEvent
