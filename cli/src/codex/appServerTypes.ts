export type ApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never';
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export interface InitializeCapabilities {
    experimentalApi: boolean;
}

export interface InitializeParams {
    clientInfo: {
        name: string;
        title?: string;
        version: string;
    };
    capabilities: InitializeCapabilities | null;
}

export interface InitializeResponse {
    userAgent?: string;
    [key: string]: unknown;
}

export interface ThreadStartParams {
    model?: string;
    modelProvider?: string;
    cwd?: string;
    approvalPolicy?: ApprovalPolicy;
    sandbox?: SandboxMode;
    config?: Record<string, unknown>;
    baseInstructions?: string;
    developerInstructions?: string;
    personality?: string;
    ephemeral?: boolean;
    experimentalRawEvents?: boolean;
}

export interface ThreadStartResponse {
    thread: {
        id: string;
    };
    model: string;
    [key: string]: unknown;
}

export interface ThreadReadParams {
    threadId: string;
    includeTurns?: boolean;
}

export interface ThreadReadResponse {
    thread?: {
        id?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface ThreadArchiveParams {
    threadId: string;
}

export interface ThreadArchiveResponse {
    [key: string]: unknown;
}

export interface ThreadUnarchiveParams {
    threadId: string;
}

export interface ThreadUnarchiveResponse {
    thread?: {
        id?: string;
        name?: string | null;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface ThreadCompactStartParams {
    threadId: string;
}

export interface ThreadCompactStartResponse {
    [key: string]: unknown;
}

export interface ThreadListParams {
    cursor?: string | null;
    limit?: number;
    archived?: boolean;
    cwd?: string;
    sortKey?: string;
    modelProviders?: string[];
    sourceKinds?: string[];
}

export interface ThreadListResponse {
    data?: Array<Record<string, unknown>>;
    nextCursor?: string | null;
    [key: string]: unknown;
}

export interface SkillsListParams {
    cwds?: string[];
    forceReload?: boolean;
    perCwdExtraUserRoots?: Array<{
        cwd: string;
        extraUserRoots: string[];
    }>;
}

export interface SkillsListResponse {
    data?: Array<{
        cwd?: string;
        skills?: Array<Record<string, unknown>>;
        errors?: unknown[];
        [key: string]: unknown;
    }>;
    [key: string]: unknown;
}

export interface McpServerStatusListParams {
    cursor?: string | null;
    limit?: number;
}

export interface McpServerStatusListResponse {
    data?: Array<Record<string, unknown>>;
    nextCursor?: string | null;
    [key: string]: unknown;
}

export interface ConfigMcpServerReloadParams {
    [key: string]: never;
}

export interface ConfigMcpServerReloadResponse {
    [key: string]: unknown;
}

export interface ConfigReadParams {
    includeLayers?: boolean;
}

export interface ConfigReadResponse {
    config?: Record<string, unknown>;
    origins?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface ConfigValueWriteParams {
    keyPath: string;
    value: unknown;
    mergeStrategy?: string;
}

export interface ConfigValueWriteResponse {
    [key: string]: unknown;
}

export interface ConfigBatchWriteEdit {
    keyPath: string;
    value: unknown;
    mergeStrategy?: string;
}

export interface ConfigBatchWriteParams {
    edits: ConfigBatchWriteEdit[];
}

export interface ConfigBatchWriteResponse {
    [key: string]: unknown;
}

export type ResponseItem = Record<string, unknown>;

export interface ThreadResumeParams {
    threadId: string;
    history?: ResponseItem[];
    path?: string;
    model?: string;
    modelProvider?: string;
    cwd?: string;
    approvalPolicy?: ApprovalPolicy;
    sandbox?: SandboxMode;
    config?: Record<string, unknown>;
    baseInstructions?: string;
    developerInstructions?: string;
    personality?: string;
}

export interface ThreadResumeResponse {
    thread: {
        id: string;
    };
    model: string;
    [key: string]: unknown;
}

export type UserInput =
    | {
        type: 'text';
        text: string;
        textElements?: Array<{
            byteRange: { start: number; end: number };
            placeholder?: string;
        }>;
    }
    | {
        type: 'image';
        url: string;
    }
    | {
        type: 'localImage';
        path: string;
    }
    | {
        type: 'skill';
        name: string;
        path: string;
    }
    | {
        type: 'mention';
        name: string;
        path: string;
    };

export type SandboxPolicy =
    | { type: 'dangerFullAccess' }
    | { type: 'readOnly' }
    | { type: 'externalSandbox'; networkAccess?: 'restricted' | 'enabled' }
    | {
        type: 'workspaceWrite';
        writableRoots?: string[];
        networkAccess?: boolean;
        excludeTmpdirEnvVar?: boolean;
        excludeSlashTmp?: boolean;
    };

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'auto';
export type ReasoningSummary = 'auto' | 'none' | 'brief' | 'detailed';

export type CollaborationMode = {
    mode: 'plan' | 'default';
    settings: {
        model: string;
        reasoning_effort?: ReasoningEffort | null;
        developer_instructions?: string | null;
    };
};

export interface TurnStartParams {
    threadId: string;
    input: UserInput[];
    cwd?: string;
    approvalPolicy?: ApprovalPolicy;
    sandboxPolicy?: SandboxPolicy;
    model?: string;
    effort?: ReasoningEffort;
    summary?: ReasoningSummary;
    personality?: string;
    outputSchema?: unknown;
    collaborationMode?: CollaborationMode;
}

export interface TurnStartResponse {
    turn: {
        id: string;
        status?: string;
    };
    [key: string]: unknown;
}

export interface TurnSteerParams {
    threadId: string;
    turnId?: string;
    input: UserInput[];
}

export interface TurnSteerResponse {
    turnId?: string;
    [key: string]: unknown;
}

export interface TurnInterruptParams {
    threadId: string;
    turnId: string;
}

export interface TurnInterruptResponse {
    ok: boolean;
    [key: string]: unknown;
}

export interface ReviewStartParams {
    threadId: string;
    target?: 'uncommitted' | 'branch' | 'commits' | 'full';
    commits?: string[];
    baseBranch?: string;
    headBranch?: string;
    delivery?: 'sameThread' | 'detached';
}

export interface ReviewStartResponse {
    reviewThreadId?: string;
    turn?: {
        id?: string;
        status?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
