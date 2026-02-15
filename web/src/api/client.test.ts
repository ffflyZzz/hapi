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
        await client.spawnSession('machine 1', '/tmp/work', 'codex', 'o3', true, 'worktree', 'feature-1')

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
})
