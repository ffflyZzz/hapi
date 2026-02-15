import { describe, expect, it } from 'bun:test'

import { Store } from './index'

describe('messages store core behavior', () => {
    it('deduplicates by localId and keeps per-session sequence', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('chat', { path: '/tmp' }, null, 'default')

        const first = store.messages.addMessage(session.id, { text: 'first' }, 'local-1')
        const duplicate = store.messages.addMessage(session.id, { text: 'duplicate' }, 'local-1')
        const second = store.messages.addMessage(session.id, { text: 'second' }, 'local-2')

        expect(duplicate.id).toBe(first.id)
        expect(second.seq).toBe(first.seq + 1)
        expect(store.messages.getMessages(session.id).length).toBe(2)
    })

    it('supports pagination with beforeSeq/afterSeq and safe limits', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('chat', { path: '/tmp' }, null, 'default')

        for (let i = 1; i <= 5; i++) {
            store.messages.addMessage(session.id, { idx: i })
        }

        const latestTwo = store.messages.getMessages(session.id, 2)
        expect(latestTwo.map((message) => message.seq)).toEqual([4, 5])

        const beforeFour = store.messages.getMessages(session.id, 10, 4)
        expect(beforeFour.map((message) => message.seq)).toEqual([1, 2, 3])

        const afterThree = store.messages.getMessagesAfter(session.id, 3, 10)
        expect(afterThree.map((message) => message.seq)).toEqual([4, 5])

        const clampedLimit = store.messages.getMessages(session.id, -10)
        expect(clampedLimit).toHaveLength(1)
        expect(clampedLimit[0]?.seq).toBe(5)
    })

    it('merges sessions with seq rebasing and localId collision handling', () => {
        const store = new Store(':memory:')
        const from = store.sessions.getOrCreateSession('from', { path: '/from' }, null, 'default')
        const to = store.sessions.getOrCreateSession('to', { path: '/to' }, null, 'default')

        store.messages.addMessage(to.id, { source: 'to', text: 'keep' }, 'collision')
        store.messages.addMessage(from.id, { source: 'from', text: 'first' }, 'collision')
        store.messages.addMessage(from.id, { source: 'from', text: 'second' }, 'from-2')

        const result = store.messages.mergeSessionMessages(from.id, to.id)
        expect(result).toEqual({ moved: 2, oldMaxSeq: 2, newMaxSeq: 1 })

        const merged = store.messages.getMessages(to.id, 20)
        expect(merged).toHaveLength(3)
        expect(merged.map((message) => message.seq)).toEqual([1, 2, 3])

        const collidedFromMessage = merged.find((message) => (message.content as any)?.source === 'from' && (message.content as any)?.text === 'first')
        expect(collidedFromMessage?.localId).toBeNull()
    })

    it('returns no-op result when merging the same session id', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('chat', { path: '/tmp' }, null, 'default')

        const result = store.messages.mergeSessionMessages(session.id, session.id)
        expect(result).toEqual({ moved: 0, oldMaxSeq: 0, newMaxSeq: 0 })
    })
})
