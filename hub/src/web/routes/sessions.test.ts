import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { Session, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createSessionsRoutes } from './sessions'

function createSession(overrides?: Partial<Session>): Session {
    const baseMetadata = {
        path: '/tmp/project',
        host: 'localhost',
        flavor: 'codex' as const
    }
    const base: Session = {
        id: 'session-1',
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: baseMetadata,
        metadataVersion: 1,
        agentState: {
            controlledByUser: false,
            requests: {},
            completedRequests: {}
        },
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 1,
        model: 'gpt-5.4',
        permissionMode: 'default',
        collaborationMode: 'default'
    }

    return {
        ...base,
        ...overrides,
        metadata: overrides?.metadata === undefined
            ? base.metadata
            : overrides.metadata === null
                ? null
                : {
                    ...baseMetadata,
                    ...overrides.metadata
                },
        agentState: overrides?.agentState === undefined ? base.agentState : overrides.agentState
    }
}

function createApp(session: Session) {
    const applySessionConfigCalls: Array<[string, { collaborationMode: string }]> = []
    const archiveSessionCalls: string[] = []
    const archiveCodexThreadCalls: string[] = []
    const compactCodexThreadCalls: string[] = []
    const applySessionConfig = async (sessionId: string, config: { collaborationMode: string }) => {
        applySessionConfigCalls.push([sessionId, config])
    }
    const unarchiveCodexThreadCalls: string[] = []
    const readCodexThreadCalls: string[] = []
    const listCodexThreadsCalls: Array<[string, { cursor?: string | null; limit?: number; archived?: boolean }]> = []
    const listCodexSkillsCalls: Array<[string, { forceReload?: boolean }]> = []
    const readCodexConfigCalls: Array<[string, { includeLayers?: boolean }]> = []
    const writeCodexConfigValueCalls: Array<[string, { keyPath: string; value: unknown; mergeStrategy?: string }]> = []
    const batchWriteCodexConfigCalls: Array<[string, { edits: Array<{ keyPath: string; value: unknown; mergeStrategy?: string }> }]> = []
    const listCodexMcpStatusCalls: Array<[string, { cursor?: string | null; limit?: number }]> = []
    const reloadCodexMcpConfigCalls: string[] = []
    const engine = {
        resolveSessionAccess: () => ({ ok: true, sessionId: session.id, session }),
        applySessionConfig,
        archiveSession: async (sessionId: string) => {
            archiveSessionCalls.push(sessionId)
        },
        archiveCodexThread: async (sessionId: string) => {
            archiveCodexThreadCalls.push(sessionId)
        },
        compactCodexThread: async (sessionId: string) => {
            compactCodexThreadCalls.push(sessionId)
        },
        unarchiveCodexThread: async (sessionId: string) => {
            unarchiveCodexThreadCalls.push(sessionId)
            return { thread: { id: 'thread-archived', name: 'Bug bash notes' } }
        },
        readCodexThread: async (sessionId: string) => {
            readCodexThreadCalls.push(sessionId)
            return {
                thread: { id: 'thread-live', name: 'Current thread' }
            }
        },
        listCodexThreads: async (
            sessionId: string,
            options: { cursor?: string | null; limit?: number; archived?: boolean }
        ) => {
            listCodexThreadsCalls.push([sessionId, options])
            return {
                data: [{ id: 'thread-live', name: 'Current thread' }],
                nextCursor: null
            }
        },
        listCodexSkills: async (sessionId: string, options: { forceReload?: boolean }) => {
            listCodexSkillsCalls.push([sessionId, options])
            return {
                data: [{
                    cwd: '/tmp/project',
                    skills: [{
                        name: 'skill-creator',
                        description: 'Create skills',
                        enabled: true
                    }],
                    errors: []
                }]
            }
        },
        readCodexConfig: async (sessionId: string, options: { includeLayers?: boolean }) => {
            readCodexConfigCalls.push([sessionId, options])
            return {
                config: {
                    apps: {
                        _default: {
                            enabled: true
                        }
                    }
                },
                origins: {}
            }
        },
        writeCodexConfigValue: async (
            sessionId: string,
            params: { keyPath: string; value: unknown; mergeStrategy?: string }
        ) => {
            writeCodexConfigValueCalls.push([sessionId, params])
            return {}
        },
        batchWriteCodexConfig: async (
            sessionId: string,
            params: { edits: Array<{ keyPath: string; value: unknown; mergeStrategy?: string }> }
        ) => {
            batchWriteCodexConfigCalls.push([sessionId, params])
            return {}
        },
        listCodexMcpServerStatus: async (sessionId: string, options: { cursor?: string | null; limit?: number }) => {
            listCodexMcpStatusCalls.push([sessionId, options])
            return {
                data: [],
                nextCursor: null
            }
        },
        reloadCodexMcpServerConfig: async (sessionId: string) => {
            reloadCodexMcpConfigCalls.push(sessionId)
            return {}
        }
    } as Partial<SyncEngine>

    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', 'default')
        await next()
    })
    app.route('/api', createSessionsRoutes(() => engine as SyncEngine))

    return {
        app,
        applySessionConfigCalls,
        archiveSessionCalls,
        archiveCodexThreadCalls,
        compactCodexThreadCalls,
        unarchiveCodexThreadCalls,
        readCodexThreadCalls,
        listCodexThreadsCalls,
        listCodexSkillsCalls,
        readCodexConfigCalls,
        writeCodexConfigValueCalls,
        batchWriteCodexConfigCalls,
        listCodexMcpStatusCalls,
        reloadCodexMcpConfigCalls
    }
}

describe('sessions routes', () => {
    it('rejects collaboration mode changes for local Codex sessions', async () => {
        const session = createSession({
            agentState: {
                controlledByUser: true,
                requests: {},
                completedRequests: {}
            }
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/collaboration-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'plan' })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Collaboration mode can only be changed for remote Codex sessions'
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('rejects collaboration mode changes for non-Codex sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'claude'
            }
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/collaboration-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'plan' })
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Collaboration mode is only supported for Codex sessions'
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('applies collaboration mode changes for remote Codex sessions', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/collaboration-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'plan' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(applySessionConfigCalls).toEqual([
            ['session-1', { collaborationMode: 'plan' }]
        ])
    })

    it('archives remote Codex sessions via thread archive, not legacy session archive', async () => {
        const { app, archiveSessionCalls, archiveCodexThreadCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/archive', {
            method: 'POST'
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(archiveCodexThreadCalls).toEqual(['session-1'])
        expect(archiveSessionCalls).toEqual([])
    })

    it('rejects thread archive for local Codex sessions', async () => {
        const session = createSession({
            agentState: {
                controlledByUser: true,
                requests: {},
                completedRequests: {}
            }
        })
        const { app, archiveSessionCalls, archiveCodexThreadCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/archive', {
            method: 'POST'
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Codex thread archive can only be used for remote Codex sessions'
        })
        expect(archiveCodexThreadCalls).toEqual([])
        expect(archiveSessionCalls).toEqual([])
    })

    it('restores an archived Codex thread for inactive sessions', async () => {
        const { app, unarchiveCodexThreadCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/codex/unarchive-thread', {
            method: 'POST'
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            ok: true,
            thread: { id: 'thread-archived', name: 'Bug bash notes' }
        })
        expect(unarchiveCodexThreadCalls).toEqual(['session-1'])
    })

    it('compacts remote Codex threads through the Codex route', async () => {
        const { app, compactCodexThreadCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/codex/compact-thread', {
            method: 'POST'
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(compactCodexThreadCalls).toEqual(['session-1'])
    })

    it('reads the current Codex thread payload', async () => {
        const { app, readCodexThreadCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/codex/thread')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            thread: { id: 'thread-live', name: 'Current thread' }
        })
        expect(readCodexThreadCalls).toEqual(['session-1'])
    })

    it('lists Codex threads with archived filter', async () => {
        const { app, listCodexThreadsCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/codex/threads?archived=true&limit=10')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            data: [{ id: 'thread-live', name: 'Current thread' }],
            nextCursor: null
        })
        expect(listCodexThreadsCalls).toEqual([
            ['session-1', { archived: true, limit: 10 }]
        ])
    })

    it('uses Codex app-server skills for Codex sessions', async () => {
        const { app, listCodexSkillsCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/skills?forceReload=true')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            data: [{
                cwd: '/tmp/project',
                skills: [{
                    name: 'skill-creator',
                    description: 'Create skills',
                    enabled: true
                }],
                errors: []
            }]
        })
        expect(listCodexSkillsCalls).toEqual([
            ['session-1', { forceReload: true }]
        ])
    })

    it('reads Codex config with includeLayers query support', async () => {
        const { app, readCodexConfigCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/codex/config?includeLayers=true')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            config: {
                apps: {
                    _default: {
                        enabled: true
                    }
                }
            },
            origins: {}
        })
        expect(readCodexConfigCalls).toEqual([
            ['session-1', { includeLayers: true }]
        ])
    })

    it('writes a single Codex config value', async () => {
        const { app, writeCodexConfigValueCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/codex/config/value', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                keyPath: 'apps._default.enabled',
                value: false,
                mergeStrategy: 'replace'
            })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(writeCodexConfigValueCalls).toEqual([
            ['session-1', {
                keyPath: 'apps._default.enabled',
                value: false,
                mergeStrategy: 'replace'
            }]
        ])
    })

    it('batch writes Codex config edits atomically', async () => {
        const { app, batchWriteCodexConfigCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/codex/config/batch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                edits: [
                    {
                        keyPath: 'apps._default.enabled',
                        value: true,
                        mergeStrategy: 'upsert'
                    }
                ]
            })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(batchWriteCodexConfigCalls).toEqual([
            ['session-1', {
                edits: [
                    {
                        keyPath: 'apps._default.enabled',
                        value: true,
                        mergeStrategy: 'upsert'
                    }
                ]
            }]
        ])
    })

    it('lists Codex MCP status with pagination query params', async () => {
        const { app, listCodexMcpStatusCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/codex/mcp-status?cursor=next&limit=25')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            data: [],
            nextCursor: null
        })
        expect(listCodexMcpStatusCalls).toEqual([
            ['session-1', { cursor: 'next', limit: 25 }]
        ])
    })

    it('reloads Codex MCP config', async () => {
        const { app, reloadCodexMcpConfigCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/codex/mcp-reload', {
            method: 'POST'
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(reloadCodexMcpConfigCalls).toEqual(['session-1'])
    })
})
