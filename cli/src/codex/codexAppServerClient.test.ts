import { describe, expect, it, vi } from 'vitest';
import { CodexAppServerClient } from './codexAppServerClient';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock('@/utils/process', () => ({
    killProcessByChildProcess: vi.fn().mockResolvedValue(undefined)
}));

describe('CodexAppServerClient wrappers', () => {
    function setup() {
        const client = new CodexAppServerClient();
        const sendRequest = vi.fn();
        const sendNotification = vi.fn();
        (client as any).sendRequest = sendRequest;
        (client as any).sendNotification = sendNotification;
        return { client, sendRequest, sendNotification };
    }

    it('initialize sends initialize request then initialized notification', async () => {
        const { client, sendRequest, sendNotification } = setup();
        sendRequest.mockResolvedValue({ userAgent: 'hapi' });

        const response = await client.initialize({
            clientInfo: { name: 'hapi-codex-client', version: '1.0.0' },
            capabilities: { experimentalApi: true }
        });

        expect(sendRequest).toHaveBeenCalledWith(
            'initialize',
            {
                clientInfo: { name: 'hapi-codex-client', version: '1.0.0' },
                capabilities: { experimentalApi: true }
            },
            { timeoutMs: 30_000 }
        );
        expect(sendNotification).toHaveBeenCalledWith('initialized');
        expect(response).toEqual({ userAgent: 'hapi' });
    });

    it('supports thread read/list wrappers', async () => {
        const { client, sendRequest } = setup();

        sendRequest.mockResolvedValueOnce({ thread: { id: 'thr_1' } });
        await client.readThread({ threadId: 'thr_1', includeTurns: true });
        expect(sendRequest).toHaveBeenNthCalledWith(
            1,
            'thread/read',
            { threadId: 'thr_1', includeTurns: true },
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );

        sendRequest.mockResolvedValueOnce({ data: [] });
        await client.listThreads({ limit: 20, archived: false });
        expect(sendRequest).toHaveBeenNthCalledWith(
            2,
            'thread/list',
            { limit: 20, archived: false },
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );

        sendRequest.mockResolvedValueOnce({ data: [] });
        await client.listThreads();
        expect(sendRequest).toHaveBeenNthCalledWith(
            3,
            'thread/list',
            {},
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );
    });

    it('supports turn steer wrapper', async () => {
        const { client, sendRequest } = setup();
        sendRequest.mockResolvedValue({ turnId: 'turn_2' });

        await client.steerTurn({
            threadId: 'thr_1',
            turnId: 'turn_1',
            input: [{ type: 'text', text: 'continue' }]
        });

        expect(sendRequest).toHaveBeenCalledWith(
            'turn/steer',
            {
                threadId: 'thr_1',
                turnId: 'turn_1',
                input: [{ type: 'text', text: 'continue' }]
            },
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );
    });

    it('supports review start wrapper', async () => {
        const { client, sendRequest } = setup();
        sendRequest.mockResolvedValue({ reviewThreadId: 'rev_1' });

        await client.startReview({
            threadId: 'thr_1',
            target: 'uncommitted',
            delivery: 'detached'
        });

        expect(sendRequest).toHaveBeenCalledWith(
            'review/start',
            {
                threadId: 'thr_1',
                target: 'uncommitted',
                delivery: 'detached'
            },
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );
    });

    it('supports thread archive, unarchive, and compaction wrappers', async () => {
        const { client, sendRequest } = setup();

        sendRequest.mockResolvedValueOnce({});
        await client.archiveThread({ threadId: 'thr_1' });
        expect(sendRequest).toHaveBeenNthCalledWith(
            1,
            'thread/archive',
            { threadId: 'thr_1' },
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );

        sendRequest.mockResolvedValueOnce({ thread: { id: 'thr_1', name: 'Bug bash notes' } });
        await client.unarchiveThread({ threadId: 'thr_1' });
        expect(sendRequest).toHaveBeenNthCalledWith(
            2,
            'thread/unarchive',
            { threadId: 'thr_1' },
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );

        sendRequest.mockResolvedValueOnce({});
        await client.startThreadCompaction({ threadId: 'thr_1' });
        expect(sendRequest).toHaveBeenNthCalledWith(
            3,
            'thread/compact/start',
            { threadId: 'thr_1' },
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );
    });

    it('supports skills, MCP status, MCP reload, and config read wrappers', async () => {
        const { client, sendRequest } = setup();

        sendRequest.mockResolvedValueOnce({
            data: [
                {
                    cwd: '/repo',
                    skills: [{ name: 'skill-creator', description: 'Create skills', enabled: true }],
                    errors: []
                }
            ]
        });
        await client.listSkills({
            cwds: ['/repo'],
            forceReload: true,
            perCwdExtraUserRoots: [{ cwd: '/repo', extraUserRoots: ['/skills'] }]
        });
        expect(sendRequest).toHaveBeenNthCalledWith(
            1,
            'skills/list',
            {
                cwds: ['/repo'],
                forceReload: true,
                perCwdExtraUserRoots: [{ cwd: '/repo', extraUserRoots: ['/skills'] }]
            },
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );

        sendRequest.mockResolvedValueOnce({ data: [], nextCursor: null });
        await client.listMcpServerStatus({ limit: 20, cursor: null });
        expect(sendRequest).toHaveBeenNthCalledWith(
            2,
            'mcpServerStatus/list',
            { limit: 20, cursor: null },
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );

        sendRequest.mockResolvedValueOnce({});
        await client.reloadMcpServerConfig();
        expect(sendRequest).toHaveBeenNthCalledWith(
            3,
            'config/mcpServer/reload',
            {},
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );

        sendRequest.mockResolvedValueOnce({ config: { apps: { _default: { enabled: true } } }, origins: {} });
        await client.readConfig({ includeLayers: false });
        expect(sendRequest).toHaveBeenNthCalledWith(
            4,
            'config/read',
            { includeLayers: false },
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );
    });

    it('supports config write wrappers', async () => {
        const { client, sendRequest } = setup();

        sendRequest.mockResolvedValueOnce({});
        await client.writeConfigValue({
            keyPath: 'apps._default.enabled',
            value: false,
            mergeStrategy: 'replace'
        });
        expect(sendRequest).toHaveBeenNthCalledWith(
            1,
            'config/value/write',
            {
                keyPath: 'apps._default.enabled',
                value: false,
                mergeStrategy: 'replace'
            },
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );

        sendRequest.mockResolvedValueOnce({});
        await client.batchWriteConfig({
            edits: [
                {
                    keyPath: 'apps._default.enabled',
                    value: true,
                    mergeStrategy: 'upsert'
                }
            ]
        });
        expect(sendRequest).toHaveBeenNthCalledWith(
            2,
            'config/batchWrite',
            {
                edits: [
                    {
                        keyPath: 'apps._default.enabled',
                        value: true,
                        mergeStrategy: 'upsert'
                    }
                ]
            },
            { signal: undefined, timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS }
        );
    });

    it('keeps interrupt timeout short', async () => {
        const { client, sendRequest } = setup();
        sendRequest.mockResolvedValue({ ok: true });

        await client.interruptTurn({ threadId: 'thr_1', turnId: 'turn_1' });

        expect(sendRequest).toHaveBeenCalledWith(
            'turn/interrupt',
            { threadId: 'thr_1', turnId: 'turn_1' },
            { timeoutMs: 30_000 }
        );
    });
});
