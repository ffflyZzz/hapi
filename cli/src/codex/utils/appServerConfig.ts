import type { ThreadStartParams, TurnStartParams } from '../appServerTypes';
import type { EnhancedMode } from '../loop';
import type { CodexCliOverrides } from './codexCliOverrides';
import { codexSystemPrompt } from './systemPrompt';

type ResolvedRuntimeConfig = {
    approvalPolicy: NonNullable<ThreadStartParams['approvalPolicy']>;
    sandbox: NonNullable<ThreadStartParams['sandbox']>;
};

function resolveByPermissionMode(mode: EnhancedMode): ResolvedRuntimeConfig {
    switch (mode.permissionMode) {
        case 'default':
            return {
                approvalPolicy: 'untrusted',
                sandbox: 'workspace-write'
            };
        case 'read-only':
            return {
                approvalPolicy: 'never',
                sandbox: 'read-only'
            };
        case 'safe-yolo':
            return {
                approvalPolicy: 'on-failure',
                sandbox: 'workspace-write'
            };
        case 'yolo':
            return {
                approvalPolicy: 'on-failure',
                sandbox: 'danger-full-access'
            };
        default:
            throw new Error(`Unknown permission mode: ${mode.permissionMode}`);
    }
}

function resolveRuntimeConfig(
    mode: EnhancedMode,
    cliOverrides?: CodexCliOverrides
): ResolvedRuntimeConfig {
    const defaults = resolveByPermissionMode(mode);

    // Keep behavior consistent with MCP mode: only default mode accepts CLI overrides.
    if (mode.permissionMode !== 'default') {
        return defaults;
    }

    return {
        approvalPolicy: cliOverrides?.approvalPolicy ?? defaults.approvalPolicy,
        sandbox: cliOverrides?.sandbox ?? defaults.sandbox
    };
}

function toSandboxPolicy(
    sandbox: NonNullable<ThreadStartParams['sandbox']>
): TurnStartParams['sandboxPolicy'] {
    switch (sandbox) {
        case 'danger-full-access':
            return { type: 'dangerFullAccess' };
        case 'read-only':
            return { type: 'readOnly' };
        case 'workspace-write':
            return { type: 'workspaceWrite' };
        default:
            throw new Error(`Unknown sandbox mode: ${sandbox}`);
    }
}

export function buildThreadStartParams(args: {
    mode: EnhancedMode;
    mcpServers: Record<string, { command: string; args: string[] }>;
    cliOverrides?: CodexCliOverrides;
}): ThreadStartParams {
    const resolved = resolveRuntimeConfig(args.mode, args.cliOverrides);
    const params: ThreadStartParams = {
        approvalPolicy: resolved.approvalPolicy,
        sandbox: resolved.sandbox,
        config: {
            mcp_servers: args.mcpServers
        },
        developerInstructions: codexSystemPrompt
    };

    if (args.mode.model) {
        params.model = args.mode.model;
    }

    return params;
}

export function buildTurnStartParams(args: {
    threadId: string;
    message: string;
    mode: EnhancedMode;
    cliOverrides?: CodexCliOverrides;
}): TurnStartParams {
    const resolved = resolveRuntimeConfig(args.mode, args.cliOverrides);
    const params: TurnStartParams = {
        threadId: args.threadId,
        input: [
            {
                type: 'text',
                text: args.message
            }
        ],
        approvalPolicy: resolved.approvalPolicy,
        sandboxPolicy: toSandboxPolicy(resolved.sandbox)
    };

    if (args.mode.model) {
        params.model = args.mode.model;
    }

    return params;
}
