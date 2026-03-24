import { describe, expect, it } from 'bun:test'
import { toSessionSummary } from '@hapi/protocol'
import type { SyncEvent } from '@hapi/protocol/types'
import { Store } from '../store'
import { RpcRegistry } from '../socket/rpcRegistry'
import type { EventPublisher } from './eventPublisher'
import { SessionCache } from './sessionCache'
import { SyncEngine } from './syncEngine'

function createPublisher(events: SyncEvent[]): EventPublisher {
    return {
        emit: (event: SyncEvent) => {
            events.push(event)
        }
    } as unknown as EventPublisher
}

describe('session model', () => {
    it('includes explicit model in session summaries', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-model-summary',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'default',
            'gpt-5.4'
        )

        expect(session.model).toBe('gpt-5.4')
        expect(toSessionSummary(session).model).toBe('gpt-5.4')
    })

    it('preserves model from old session when merging into resumed session', async () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const oldSession = cache.getOrCreateSession(
            'session-model-old',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'default',
            'gpt-5.4'
        )
        const newSession = cache.getOrCreateSession(
            'session-model-new',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'default'
        )

        await cache.mergeSessions(oldSession.id, newSession.id, 'default')

        const merged = cache.getSession(newSession.id)
        expect(merged?.model).toBe('gpt-5.4')
    })

    it('persists applied session model updates, including clear-to-auto', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-model-config',
            { path: '/tmp/project', host: 'localhost', flavor: 'claude' },
            null,
            'default',
            'sonnet'
        )

        cache.applySessionConfig(session.id, { model: 'opus[1m]' })
        expect(cache.getSession(session.id)?.model).toBe('opus[1m]')
        expect(store.sessions.getSession(session.id)?.model).toBe('opus[1m]')

        cache.applySessionConfig(session.id, { model: null })
        expect(cache.getSession(session.id)?.model).toBeNull()
        expect(store.sessions.getSession(session.id)?.model).toBeNull()
    })

    it('persists keepalive model changes, including clearing the model', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-model-heartbeat',
            { path: '/tmp/project', host: 'localhost', flavor: 'claude' },
            null,
            'default',
            'sonnet'
        )

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            model: null
        })

        expect(cache.getSession(session.id)?.model).toBeNull()
        expect(store.sessions.getSession(session.id)?.model).toBeNull()
    })

    it('tracks collaboration mode updates in memory from config and keepalive', () => {
        const store = new Store(':memory:')
        const events: SyncEvent[] = []
        const cache = new SessionCache(store, createPublisher(events))

        const session = cache.getOrCreateSession(
            'session-collaboration-mode',
            { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            null,
            'default',
            'gpt-5.4'
        )

        cache.applySessionConfig(session.id, { collaborationMode: 'plan' })
        expect(cache.getSession(session.id)?.collaborationMode).toBe('plan')

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            collaborationMode: 'default'
        })
        expect(cache.getSession(session.id)?.collaborationMode).toBe('default')
    })

    it('passes the stored model when respawning a resumed session', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-model-resume',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexSessionId: 'codex-thread-1'
                },
                null,
                'default',
                'gpt-5.4'
            )
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', happyCliVersion: '0.1.0' },
                null,
                'default'
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let capturedModel: string | undefined
            ;(engine as any).rpcGateway.spawnSession = async (
                _machineId: string,
                _directory: string,
                _agent: string,
                model?: string
            ) => {
                capturedModel = model
                return { type: 'success', sessionId: session.id }
            }
            ;(engine as any).waitForSessionActive = async () => true

            const result = await engine.resumeSession(session.id, 'default')

            expect(result).toEqual({ type: 'success', sessionId: session.id })
            expect(capturedModel).toBe('gpt-5.4')
        } finally {
            engine.stop()
        }
    })

    it('passes resume session ID to rpc gateway when resuming claude session', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-claude-resume',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'claude',
                    claudeSessionId: 'claude-session-1'
                },
                null,
                'default',
                'sonnet'
            )
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', happyCliVersion: '0.1.0' },
                null,
                'default'
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            let capturedResumeSessionId: string | undefined
            ;(engine as any).rpcGateway.spawnSession = async (
                _machineId: string,
                _directory: string,
                _agent: string,
                _model?: string,
                _modelReasoningEffort?: string,
                _yolo?: boolean,
                _sessionType?: 'simple' | 'worktree',
                _worktreeName?: string,
                resumeSessionId?: string
            ) => {
                capturedResumeSessionId = resumeSessionId
                return { type: 'success', sessionId: session.id }
            }
            ;(engine as any).waitForSessionActive = async () => true

            const result = await engine.resumeSession(session.id, 'default')

            expect(result).toEqual({ type: 'success', sessionId: session.id })
            expect(capturedResumeSessionId).toBe('claude-session-1')
        } finally {
            engine.stop()
        }
    })

    it('marks Codex metadata as archived and inactive after thread archive', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-codex-archive',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexSessionId: 'codex-thread-1'
                },
                null,
                'default',
                'gpt-5.4'
            )
            engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })
            ;(engine as any).rpcGateway.archiveCodexThread = async () => ({})

            await engine.archiveCodexThread(session.id)

            const archived = engine.getSession(session.id)
            expect(archived?.active).toBe(false)
            expect(archived?.metadata?.lifecycleState).toBe('archived')
            expect(archived?.metadata?.archivedBy).toBe('user')
            expect(archived?.metadata?.archiveReason).toBe('Archived thread via web')
        } finally {
            engine.stop()
        }
    })

    it('clears Codex archived metadata after unarchive', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )

        try {
            const session = engine.getOrCreateSession(
                'session-codex-unarchive',
                {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexSessionId: 'codex-thread-1',
                    lifecycleState: 'archived',
                    lifecycleStateSince: Date.now(),
                    archivedBy: 'user',
                    archiveReason: 'Archived thread via web'
                },
                null,
                'default',
                'gpt-5.4'
            )
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', happyCliVersion: '0.1.0' },
                null,
                'default'
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })
            ;(engine as any).rpcGateway.unarchiveCodexThread = async () => ({
                thread: { id: 'codex-thread-1', name: 'Recovered thread' }
            })

            await engine.unarchiveCodexThread(session.id)

            const restored = engine.getSession(session.id)
            expect(restored?.metadata?.lifecycleState).toBeUndefined()
            expect(restored?.metadata?.archivedBy).toBeUndefined()
            expect(restored?.metadata?.archiveReason).toBeUndefined()
        } finally {
            engine.stop()
        }
    })
})
