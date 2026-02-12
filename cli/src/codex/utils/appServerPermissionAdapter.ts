import { randomUUID } from 'node:crypto';
import { logger } from '@/ui/logger';
import type { CodexPermissionHandler } from './permissionHandler';
import type { CodexAppServerClient } from '../codexAppServerClient';

type PermissionDecision = 'approved' | 'approved_for_session' | 'denied' | 'abort';

type PermissionResult = {
    decision: PermissionDecision;
    reason?: string;
    answers?: Record<string, string[]> | Record<string, { answers: string[] }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function mapDecision(decision: PermissionDecision): { decision: string } {
    switch (decision) {
        case 'approved':
            return { decision: 'accept' };
        case 'approved_for_session':
            return { decision: 'acceptForSession' };
        case 'denied':
            return { decision: 'decline' };
        case 'abort':
            return { decision: 'cancel' };
    }
}

function normalizeAnswers(
    answers: Record<string, string[]> | Record<string, { answers: string[] }> | undefined
): Record<string, string[]> {
    if (!answers) return {};

    const normalized: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(answers)) {
        if (Array.isArray(value)) {
            normalized[key] = value.filter((entry: unknown): entry is string => typeof entry === 'string');
            continue;
        }

        if (value && typeof value === 'object' && Array.isArray(value.answers)) {
            normalized[key] = value.answers.filter((entry: unknown): entry is string => typeof entry === 'string');
        }
    }

    return normalized;
}

export function registerAppServerPermissionHandlers(args: {
    client: CodexAppServerClient;
    permissionHandler: CodexPermissionHandler;
    onUserInputRequest?: (request: unknown) => Promise<Record<string, string[]> | Record<string, { answers: string[] }>>;
}): void {
    const { client, permissionHandler, onUserInputRequest } = args;

    client.registerRequestHandler('item/commandExecution/requestApproval', async (params) => {
        const record = asRecord(params) ?? {};
        const toolCallId = asString(record.itemId) ?? randomUUID();
        const reason = asString(record.reason);
        const command = record.command;
        const cwd = asString(record.cwd);

        const result = await permissionHandler.handleToolCall(
            toolCallId,
            'CodexBash',
            {
                message: reason,
                command,
                cwd
            }
        ) as PermissionResult;

        return mapDecision(result.decision);
    });

    client.registerRequestHandler('item/fileChange/requestApproval', async (params) => {
        const record = asRecord(params) ?? {};
        const toolCallId = asString(record.itemId) ?? randomUUID();
        const reason = asString(record.reason);
        const grantRoot = asString(record.grantRoot);

        const result = await permissionHandler.handleToolCall(
            toolCallId,
            'CodexPatch',
            {
                message: reason,
                grantRoot
            }
        ) as PermissionResult;

        return mapDecision(result.decision);
    });

    client.registerRequestHandler('item/tool/requestUserInput', async (params) => {
        if (onUserInputRequest) {
            const answers = await onUserInputRequest(params);
            return {
                decision: 'accept',
                answers: normalizeAnswers(answers)
            };
        }

        const record = asRecord(params) ?? {};
        const toolCallId = asString(record.itemId) ?? randomUUID();
        const result = await permissionHandler.handleToolCall(
            toolCallId,
            'request_user_input',
            record
        ) as PermissionResult;

        if (result.decision === 'approved' || result.decision === 'approved_for_session') {
            return {
                decision: 'accept',
                answers: normalizeAnswers(result.answers)
            };
        }

        if (result.decision === 'denied') {
            return { decision: 'decline' };
        }

        logger.debug('[CodexAppServer] requestUserInput cancelled', { itemId: toolCallId });
        return { decision: 'cancel' };
    });

    client.registerRequestHandler('tool/requestUserInput', async (params) => {
        if (onUserInputRequest) {
            const answers = await onUserInputRequest(params);
            return {
                decision: 'accept',
                answers: normalizeAnswers(answers)
            };
        }

        const record = asRecord(params) ?? {};
        const toolCallId = asString(record.itemId) ?? asString(record.id) ?? randomUUID();

        const result = await permissionHandler.handleToolCall(
            toolCallId,
            'request_user_input',
            record
        ) as PermissionResult;

        if (result.decision === 'approved' || result.decision === 'approved_for_session') {
            return {
                decision: 'accept',
                answers: normalizeAnswers(result.answers)
            };
        }

        if (result.decision === 'denied') {
            return { decision: 'decline' };
        }

        return { decision: 'cancel' };
    });
}
