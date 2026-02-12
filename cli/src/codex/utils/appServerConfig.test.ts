import { describe, expect, it } from 'vitest';
import { buildThreadStartParams, buildTurnStartParams } from './appServerConfig';

describe('appServerConfig', () => {
    const mcpServers = {
        hapi: { command: 'node', args: ['mcp'] }
    };

    it('applies cli overrides in default mode', () => {
        const threadParams = buildThreadStartParams({
            mode: { permissionMode: 'default' },
            mcpServers,
            cliOverrides: {
                approvalPolicy: 'never',
                sandbox: 'danger-full-access'
            }
        });

        expect(threadParams.approvalPolicy).toBe('never');
        expect(threadParams.sandbox).toBe('danger-full-access');

        const turnParams = buildTurnStartParams({
            threadId: 'thread-1',
            message: 'hello',
            mode: { permissionMode: 'default' },
            cliOverrides: {
                approvalPolicy: 'never',
                sandbox: 'danger-full-access'
            }
        });
        expect(turnParams.approvalPolicy).toBe('never');
        expect(turnParams.sandboxPolicy).toEqual({ type: 'dangerFullAccess' });
    });

    it('ignores cli overrides in non-default mode', () => {
        const threadParams = buildThreadStartParams({
            mode: { permissionMode: 'read-only' },
            mcpServers,
            cliOverrides: {
                approvalPolicy: 'on-request',
                sandbox: 'workspace-write'
            }
        });

        expect(threadParams.approvalPolicy).toBe('never');
        expect(threadParams.sandbox).toBe('read-only');
    });

    it('passes message, model and mcp config', () => {
        const threadParams = buildThreadStartParams({
            mode: { permissionMode: 'safe-yolo', model: 'o3' },
            mcpServers
        });
        expect(threadParams.model).toBe('o3');
        expect(threadParams.config).toEqual({ mcp_servers: mcpServers });

        const turnParams = buildTurnStartParams({
            threadId: 'thread-2',
            message: '继续',
            mode: { permissionMode: 'safe-yolo', model: 'o3' }
        });

        expect(turnParams.threadId).toBe('thread-2');
        expect(turnParams.input).toEqual([{ type: 'text', text: '继续' }]);
        expect(turnParams.model).toBe('o3');
        expect(turnParams.sandboxPolicy).toEqual({ type: 'workspaceWrite' });
    });
});
