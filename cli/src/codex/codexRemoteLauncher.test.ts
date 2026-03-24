import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import type { EnhancedMode } from './loop';

const harness = vi.hoisted(() => ({
    notifications: [] as Array<{ method: string; params: unknown }>,
    registerRequestCalls: [] as string[],
    initializeCalls: [] as unknown[],
    archiveCalls: [] as unknown[],
    compactCalls: [] as unknown[],
    scriptedNotifications: [] as Array<{ method: string; params: unknown }>
}));

vi.mock('./codexAppServerClient', () => {
    class MockCodexAppServerClient {
        private notificationHandler: ((method: string, params: unknown) => void) | null = null;

        async connect(): Promise<void> {}

        async initialize(params: unknown): Promise<{ protocolVersion: number }> {
            harness.initializeCalls.push(params);
            return { protocolVersion: 1 };
        }

        setNotificationHandler(handler: ((method: string, params: unknown) => void) | null): void {
            this.notificationHandler = handler;
        }

        registerRequestHandler(method: string): void {
            harness.registerRequestCalls.push(method);
        }

        async startThread(): Promise<{ thread: { id: string }; model: string }> {
            return { thread: { id: 'thread-anonymous' }, model: 'gpt-5.4' };
        }

        async resumeThread(): Promise<{ thread: { id: string }; model: string }> {
            return { thread: { id: 'thread-anonymous' }, model: 'gpt-5.4' };
        }

        async startTurn(): Promise<{ turn: Record<string, never> }> {
            const started = { turn: {} };
            harness.notifications.push({ method: 'turn/started', params: started });
            this.notificationHandler?.('turn/started', started);

            for (const notification of harness.scriptedNotifications) {
                harness.notifications.push(notification);
                this.notificationHandler?.(notification.method, notification.params);
            }

            const completed = { status: 'Completed', turn: {} };
            harness.notifications.push({ method: 'turn/completed', params: completed });
            this.notificationHandler?.('turn/completed', completed);

            return { turn: {} };
        }

        async archiveThread(params: unknown): Promise<Record<string, never>> {
            harness.archiveCalls.push(params);
            return {};
        }

        async startThreadCompaction(params: unknown): Promise<Record<string, never>> {
            harness.compactCalls.push(params);
            return {};
        }

        async interruptTurn(): Promise<Record<string, never>> {
            return {};
        }

        async disconnect(): Promise<void> {}
    }

    return { CodexAppServerClient: MockCodexAppServerClient };
});

vi.mock('./utils/buildHapiMcpBridge', () => ({
    buildHapiMcpBridge: async () => ({
        server: {
            stop: () => {}
        },
        mcpServers: {}
    })
}));

import { codexRemoteLauncher } from './codexRemoteLauncher';

type FakeAgentState = {
    requests: Record<string, unknown>;
    completedRequests: Record<string, unknown>;
};

function createMode(): EnhancedMode {
    return {
        permissionMode: 'default',
        collaborationMode: 'default'
    };
}

function createSessionStub() {
    const queue = new MessageQueue2<EnhancedMode>((mode) => JSON.stringify(mode));
    queue.push('hello from launcher test', createMode());
    queue.close();

    const sessionEvents: Array<{ type: string; [key: string]: unknown }> = [];
    const codexMessages: unknown[] = [];
    const thinkingChanges: boolean[] = [];
    const foundSessionIds: string[] = [];
    let currentModel: string | null | undefined;
    let agentState: FakeAgentState = {
        requests: {},
        completedRequests: {}
    };

    const rpcHandlers = new Map<string, (params: unknown) => unknown>();
    const client = {
        rpcHandlerManager: {
            registerHandler(method: string, handler: (params: unknown) => unknown) {
                rpcHandlers.set(method, handler);
            }
        },
        updateAgentState(handler: (state: FakeAgentState) => FakeAgentState) {
            agentState = handler(agentState);
        },
        sendAgentMessage(message: unknown) {
            codexMessages.push(message);
        },
        sendUserMessage(_text: string) {},
        sendSessionEvent(event: { type: string; [key: string]: unknown }) {
            sessionEvents.push(event);
        }
    };

    const session = {
        path: '/tmp/hapi-update',
        logPath: '/tmp/hapi-update/test.log',
        client,
        queue,
        codexArgs: undefined,
        codexCliOverrides: undefined,
        sessionId: null as string | null,
        thinking: false,
        getPermissionMode() {
            return 'default' as const;
        },
        setModel(nextModel: string | null) {
            currentModel = nextModel;
        },
        getModel() {
            return currentModel;
        },
        onThinkingChange(nextThinking: boolean) {
            session.thinking = nextThinking;
            thinkingChanges.push(nextThinking);
        },
        onSessionFound(id: string) {
            session.sessionId = id;
            foundSessionIds.push(id);
        },
        sendAgentMessage(message: unknown) {
            client.sendAgentMessage(message);
        },
        sendSessionEvent(event: { type: string; [key: string]: unknown }) {
            client.sendSessionEvent(event);
        },
        sendUserMessage(text: string) {
            client.sendUserMessage(text);
        }
    };

    return {
        session,
        sessionEvents,
        codexMessages,
        thinkingChanges,
        foundSessionIds,
        rpcHandlers,
        getModel: () => currentModel,
        getAgentState: () => agentState
    };
}

describe('codexRemoteLauncher', () => {
    afterEach(() => {
        harness.notifications = [];
        harness.registerRequestCalls = [];
        harness.initializeCalls = [];
        harness.archiveCalls = [];
        harness.compactCalls = [];
        harness.scriptedNotifications = [];
    });

    it('finishes a turn and emits ready when task lifecycle events omit turn_id', async () => {
        const {
            session,
            sessionEvents,
            thinkingChanges,
            foundSessionIds,
            getModel
        } = createSessionStub();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(foundSessionIds).toContain('thread-anonymous');
        expect(getModel()).toBe('gpt-5.4');
        expect(harness.initializeCalls).toEqual([{
            clientInfo: {
                name: 'hapi-codex-client',
                version: '1.0.0'
            },
            capabilities: {
                experimentalApi: true
            }
        }]);
        expect(harness.notifications.map((entry) => entry.method)).toEqual(['turn/started', 'turn/completed']);
        expect(sessionEvents.filter((event) => event.type === 'ready').length).toBeGreaterThanOrEqual(1);
        expect(thinkingChanges).toContain(true);
        expect(session.thinking).toBe(false);
    });

    it('registers live archive/compact handlers and emits plan draft, final plan, plus compaction tool messages', async () => {
        harness.scriptedNotifications = [
            {
                method: 'item/started',
                params: {
                    turnId: 'turn-1',
                    item: { id: 'plan-1', type: 'plan', text: '' }
                }
            },
            {
                method: 'item/plan/delta',
                params: {
                    turnId: 'turn-1',
                    itemId: 'plan-1',
                    delta: 'Planning draft...'
                }
            },
            {
                method: 'turn/plan/updated',
                params: {
                    turnId: 'turn-1',
                    explanation: 'Ship admin UI',
                    plan: [
                        { step: 'Add routes', status: 'completed' },
                        { step: 'Render plan card', status: 'inProgress' }
                    ]
                }
            },
            {
                method: 'item/started',
                params: {
                    item: { id: 'compact-1', type: 'contextCompaction' }
                }
            },
            {
                method: 'item/completed',
                params: {
                    item: { id: 'compact-1', type: 'contextCompaction', status: 'completed' }
                }
            }
        ];

        const { session, codexMessages, rpcHandlers } = createSessionStub();

        await codexRemoteLauncher(session as never);

        expect(rpcHandlers.has('archive-thread')).toBe(true);
        expect(rpcHandlers.has('compact-thread')).toBe(true);

        await rpcHandlers.get('archive-thread')?.({});
        await rpcHandlers.get('compact-thread')?.({});

        expect(harness.archiveCalls).toEqual([{ threadId: 'thread-anonymous' }]);
        expect(harness.compactCalls).toEqual([{ threadId: 'thread-anonymous' }]);

        expect(codexMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'tool-call',
                name: 'update_plan',
                callId: 'codex-plan:turn-1',
                input: {
                    draft: 'Planning draft...',
                    isDraft: true
                }
            }),
            expect.objectContaining({
                type: 'tool-call',
                name: 'update_plan',
                callId: 'codex-plan:turn-1',
                input: {
                    explanation: 'Ship admin UI',
                    plan: [
                        { step: 'Add routes', status: 'completed' },
                        { step: 'Render plan card', status: 'in_progress' }
                    ]
                }
            }),
            expect.objectContaining({
                type: 'tool-call-result',
                callId: 'codex-plan:turn-1'
            }),
            expect.objectContaining({
                type: 'tool-call',
                name: 'CodexCompactThread',
                callId: 'compact-1'
            }),
            expect.objectContaining({
                type: 'tool-call-result',
                callId: 'compact-1'
            })
        ]));
    });
});
