import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClient, ApiError } from './client'

function makeJsonResponse(payload: unknown, status: number = 200, statusText: string = 'OK') {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
    }
}

function makeTextResponse(text: string, status: number, statusText: string) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText,
        json: async () => ({ error: text }),
        text: async () => text,
    }
}

function getHeader(callArgs: any[], name: string): string | null {
    const headers = new Headers(callArgs[1]?.headers)
    return headers.get(name)
}

describe('ApiClient core request flow', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('sends auth header and no-store cache for GET requests', async () => {
        const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse({ sessions: [] }))
        vi.stubGlobal('fetch', fetchMock)

        const client = new ApiClient('token-123', { baseUrl: 'http://hub.local' })
        await client.getSessions()

        expect(fetchMock).toHaveBeenCalledWith(
            'http://hub.local/api/sessions',
            expect.objectContaining({ cache: 'no-store' })
        )
        expect(getHeader(fetchMock.mock.calls[0], 'authorization')).toBe('Bearer token-123')
    })

    it('uses live token and content-type for body requests', async () => {
        const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse({}))
        vi.stubGlobal('fetch', fetchMock)

        const client = new ApiClient('fallback-token', {
            baseUrl: 'http://hub.local',
            getToken: () => 'live-token',
        })

        await client.subscribePushNotifications({
            endpoint: 'https://push.local/1',
            keys: { p256dh: 'abc', auth: 'def' },
        })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(getHeader(fetchMock.mock.calls[0], 'authorization')).toBe('Bearer live-token')
        expect(getHeader(fetchMock.mock.calls[0], 'content-type')).toBe('application/json')
    })

    it('retries once with refreshed token after 401', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(makeJsonResponse({}, 401, 'Unauthorized'))
            .mockResolvedValueOnce(makeJsonResponse({ machines: [] }))
        const refreshMock = vi.fn().mockResolvedValue('refreshed-token')
        vi.stubGlobal('fetch', fetchMock)

        const client = new ApiClient('stale-token', {
            baseUrl: 'http://hub.local',
            onUnauthorized: refreshMock,
        })

        await client.getMachines()

        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(refreshMock).toHaveBeenCalledTimes(1)
        expect(getHeader(fetchMock.mock.calls[1], 'authorization')).toBe('Bearer refreshed-token')
    })

    it('throws session expired when 401 cannot be refreshed', async () => {
        const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse({}, 401, 'Unauthorized'))
        vi.stubGlobal('fetch', fetchMock)

        const client = new ApiClient('token', {
            baseUrl: 'http://hub.local',
            onUnauthorized: async () => null,
        })

        await expect(client.getMachines()).rejects.toThrow('Session expired. Please sign in again.')
    })

    it('throws ApiError with parsed code for authenticate failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            makeTextResponse('{"error":"invalid_token"}', 403, 'Forbidden')
        ))

        const client = new ApiClient('token', { baseUrl: 'http://hub.local' })
        await expect(client.authenticate({ accessToken: 'bad-token' })).rejects.toMatchObject({
            name: 'ApiError',
            status: 403,
            code: 'invalid_token',
        } satisfies Partial<ApiError>)
    })

    it('throws ApiError for bind failure and keeps response body', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            makeTextResponse('{"error":"bind_failed"}', 400, 'Bad Request')
        ))

        const client = new ApiClient('token', { baseUrl: 'http://hub.local' })

        await expect(client.bind({ initData: 'x', accessToken: 'y' })).rejects.toMatchObject({
            name: 'ApiError',
            status: 400,
            code: 'bind_failed',
            body: '{"error":"bind_failed"}',
        } satisfies Partial<ApiError>)
    })

    it('builds message query parameters and encodes session id', async () => {
        const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse({ messages: [] }))
        vi.stubGlobal('fetch', fetchMock)

        const client = new ApiClient('token', { baseUrl: 'http://hub.local' })
        await client.getMessages('session/1', { beforeSeq: 7, limit: 20 })

        expect(fetchMock.mock.calls[0][0]).toBe(
            'http://hub.local/api/sessions/session%2F1/messages?beforeSeq=7&limit=20'
        )
    })

    it('sends spawn session payload with encoded machine id', async () => {
        const fetchMock = vi.fn().mockResolvedValue(makeJsonResponse({ sessionId: 's-1' }))
        vi.stubGlobal('fetch', fetchMock)

        const client = new ApiClient('token', { baseUrl: 'http://hub.local' })
        await client.spawnSession('machine 1', '/tmp/work', 'codex', 'o3', undefined, true, 'worktree', 'feature-1')

        expect(fetchMock.mock.calls[0][0]).toBe('http://hub.local/api/machines/machine%201/spawn')
        expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
            directory: '/tmp/work',
            agent: 'codex',
            model: 'o3',
            yolo: true,
            sessionType: 'worktree',
            worktreeName: 'feature-1',
        })
    })

    it('builds Codex admin URLs with query params and POST actions', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(makeJsonResponse({
                thread: { id: 'thread-1' }
            }))
            .mockResolvedValueOnce(makeJsonResponse({
                data: [{ id: 'thread-1' }],
                nextCursor: null
            }))
            .mockResolvedValueOnce(makeJsonResponse({
                config: { apps: { _default: { enabled: true } } },
                origins: {}
            }))
            .mockResolvedValueOnce(makeJsonResponse({
                data: [],
                nextCursor: null
            }))
            .mockResolvedValueOnce(makeJsonResponse({}))
            .mockResolvedValueOnce(makeJsonResponse({ ok: true }))
            .mockResolvedValueOnce(makeJsonResponse({ ok: true }))
            .mockResolvedValueOnce(makeJsonResponse({ ok: true }))
            .mockResolvedValueOnce(makeJsonResponse({ ok: true }))
            .mockResolvedValueOnce(makeJsonResponse({
                data: [{ cwd: '/tmp/project', skills: [{ name: 'skill-creator' }], errors: [] }]
            }))
        vi.stubGlobal('fetch', fetchMock)

        const client = new ApiClient('token', { baseUrl: 'http://hub.local' })
        await client.getCodexThread('session/1')
        await client.getCodexThreads('session/1', { archived: true, limit: 10 })
        await client.getCodexConfig('session/1', { includeLayers: true })
        await client.getCodexMcpStatus('session/1', { cursor: 'next', limit: 25 })
        await client.reloadCodexMcpConfig('session/1')
        await client.unarchiveCodexThread('session/1')
        await client.compactCodexThread('session/1')
        await client.writeCodexConfigValue('session/1', {
            keyPath: 'apps._default.enabled',
            value: false,
            mergeStrategy: 'replace'
        })
        await client.batchWriteCodexConfig('session/1', {
            edits: [
                {
                    keyPath: 'apps._default.enabled',
                    value: true,
                    mergeStrategy: 'upsert'
                }
            ]
        })
        await client.getSkills('session/1', { forceReload: true })

        expect(fetchMock.mock.calls[0][0]).toBe('http://hub.local/api/sessions/session%2F1/codex/thread')
        expect(fetchMock.mock.calls[1][0]).toBe('http://hub.local/api/sessions/session%2F1/codex/threads?archived=true&limit=10')
        expect(fetchMock.mock.calls[2][0]).toBe('http://hub.local/api/sessions/session%2F1/codex/config?includeLayers=true')
        expect(fetchMock.mock.calls[3][0]).toBe('http://hub.local/api/sessions/session%2F1/codex/mcp-status?cursor=next&limit=25')
        expect(fetchMock.mock.calls[4][0]).toBe('http://hub.local/api/sessions/session%2F1/codex/mcp-reload')
        expect(fetchMock.mock.calls[5][0]).toBe('http://hub.local/api/sessions/session%2F1/codex/unarchive-thread')
        expect(fetchMock.mock.calls[6][0]).toBe('http://hub.local/api/sessions/session%2F1/codex/compact-thread')
        expect(fetchMock.mock.calls[7][0]).toBe('http://hub.local/api/sessions/session%2F1/codex/config/value')
        expect(fetchMock.mock.calls[8][0]).toBe('http://hub.local/api/sessions/session%2F1/codex/config/batch')
        expect(fetchMock.mock.calls[9][0]).toBe('http://hub.local/api/sessions/session%2F1/skills?forceReload=true')
        expect(fetchMock.mock.calls[4][1]).toEqual(expect.objectContaining({ method: 'POST' }))
        expect(fetchMock.mock.calls[5][1]).toEqual(expect.objectContaining({ method: 'POST' }))
        expect(fetchMock.mock.calls[6][1]).toEqual(expect.objectContaining({ method: 'POST' }))
        expect(fetchMock.mock.calls[7][1]).toEqual(expect.objectContaining({ method: 'POST' }))
        expect(fetchMock.mock.calls[8][1]).toEqual(expect.objectContaining({ method: 'POST' }))
    })
})
