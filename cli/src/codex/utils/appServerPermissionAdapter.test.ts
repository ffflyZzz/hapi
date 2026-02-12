import { describe, expect, it, vi } from 'vitest';
import { registerAppServerPermissionHandlers } from './appServerPermissionAdapter';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

type Handler = (params: unknown) => Promise<unknown> | unknown;

describe('appServerPermissionAdapter', () => {
    it('maps requestUserInput approval and normalizes answers', async () => {
        const handlers = new Map<string, Handler>();
        const client = {
            registerRequestHandler(method: string, handler: Handler) {
                handlers.set(method, handler);
            }
        } as any;

        const permissionHandler = {
            handleToolCall: vi.fn().mockResolvedValue({
                decision: 'approved',
                answers: {
                    q1: { answers: ['A'] },
                    q2: ['B', 'C']
                }
            })
        } as any;

        registerAppServerPermissionHandlers({ client, permissionHandler });

        const handler = handlers.get('item/tool/requestUserInput');
        expect(handler).toBeTypeOf('function');

        const result = await handler!({ itemId: 'req-1', questions: [] });
        expect(result).toEqual({
            decision: 'accept',
            answers: {
                q1: ['A'],
                q2: ['B', 'C']
            }
        });

        expect(permissionHandler.handleToolCall).toHaveBeenCalledWith(
            'req-1',
            'request_user_input',
            { itemId: 'req-1', questions: [] }
        );
    });

    it('maps requestUserInput denied and abort to decline/cancel', async () => {
        const handlers = new Map<string, Handler>();
        const client = {
            registerRequestHandler(method: string, handler: Handler) {
                handlers.set(method, handler);
            }
        } as any;

        const permissionHandler = {
            handleToolCall: vi
                .fn()
                .mockResolvedValueOnce({ decision: 'denied' })
                .mockResolvedValueOnce({ decision: 'abort' })
        } as any;

        registerAppServerPermissionHandlers({ client, permissionHandler });

        const handler = handlers.get('tool/requestUserInput');
        expect(handler).toBeTypeOf('function');

        await expect(handler!({ id: 'req-2' })).resolves.toEqual({ decision: 'decline' });
        await expect(handler!({ id: 'req-3' })).resolves.toEqual({ decision: 'cancel' });
    });

    it('uses onUserInputRequest hook when provided', async () => {
        const handlers = new Map<string, Handler>();
        const client = {
            registerRequestHandler(method: string, handler: Handler) {
                handlers.set(method, handler);
            }
        } as any;

        const permissionHandler = {
            handleToolCall: vi.fn()
        } as any;

        const onUserInputRequest = vi.fn().mockResolvedValue({
            q1: { answers: ['X'] }
        });

        registerAppServerPermissionHandlers({
            client,
            permissionHandler,
            onUserInputRequest
        });

        const handler = handlers.get('item/tool/requestUserInput');
        const result = await handler!({ itemId: 'req-4' });

        expect(result).toEqual({
            decision: 'accept',
            answers: { q1: ['X'] }
        });
        expect(onUserInputRequest).toHaveBeenCalledWith({ itemId: 'req-4' });
        expect(permissionHandler.handleToolCall).not.toHaveBeenCalled();
    });
});
