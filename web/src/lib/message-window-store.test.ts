import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage, MessagesResponse } from '@/types/api'
import { clearMessageWindow, fetchLatestMessages, getMessageWindowState } from '@/lib/message-window-store'

const SESSION_ID = 'session-anchor-test'
const PAGE_SIZE = 50

function makeCodexToolMessage(seq: number): DecryptedMessage {
    return {
        id: `tool-${seq}`,
        localId: null,
        createdAt: seq,
        seq,
        content: {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'tool-call',
                    callId: `call-${seq}`,
                    name: 'CodexBash',
                    input: { command: `echo ${seq}` }
                }
            }
        }
    }
}

function makeCodexTextMessage(seq: number, text: string): DecryptedMessage {
    return {
        id: `text-${seq}`,
        localId: null,
        createdAt: seq,
        seq,
        content: {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'message',
                    message: text
                }
            }
        }
    }
}

function createPagedApi(messages: DecryptedMessage[]): ApiClient {
    const getMessages = vi.fn(async (_sessionId: string, options: { beforeSeq?: number | null; limit?: number }): Promise<MessagesResponse> => {
        const beforeSeq = options.beforeSeq ?? null
        const limit = options.limit ?? PAGE_SIZE
        const eligible = beforeSeq === null
            ? messages
            : messages.filter((message) => typeof message.seq === 'number' && message.seq < beforeSeq)
        const pageMessages = eligible.slice(-limit)
        const nextBeforeSeq = pageMessages.length > 0 && pageMessages[0]?.seq !== undefined
            ? pageMessages[0].seq
            : null

        return {
            messages: pageMessages,
            page: {
                limit,
                beforeSeq,
                nextBeforeSeq,
                hasMore: eligible.length > pageMessages.length
            }
        }
    })

    return { getMessages } as unknown as ApiClient
}

function makeCodexTokenCountMessage(seq: number): DecryptedMessage {
    return {
        id: `token-${seq}`,
        localId: null,
        createdAt: seq,
        seq,
        content: {
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'token_count',
                    tokens: 100
                }
            }
        }
    }
}

describe('message-window-store', () => {
    it('keeps latest assistant text visible even after long tool-only tail', async () => {
        clearMessageWindow(SESSION_ID)

        const messages: DecryptedMessage[] = []
        for (let seq = 1; seq <= 500; seq += 1) {
            messages.push(seq === 50 ? makeCodexTextMessage(seq, 'final assistant summary') : makeCodexToolMessage(seq))
        }

        const api = createPagedApi(messages)
        await fetchLatestMessages(api, SESSION_ID)

        const state = getMessageWindowState(SESSION_ID)
        const firstSeq = state.messages[0]?.seq ?? null
        const hasAssistantText = state.messages.some((message) => message.id === 'text-50')

        expect(firstSeq).toBe(50)
        expect(hasAssistantText).toBe(true)
    })

    it('counts visible messages only, ignoring invisible token_count messages', async () => {
        const sid = 'session-visible-count'
        clearMessageWindow(sid)

        // Create 600 raw messages: alternating tool-call and token_count
        // This gives us 300 visible (tool-call) + 300 invisible (token_count) = 600 raw
        // Since 300 visible < 400 limit, all messages should be retained
        const messages: DecryptedMessage[] = []
        for (let seq = 1; seq <= 600; seq += 1) {
            if (seq % 2 === 0) {
                messages.push(makeCodexTokenCountMessage(seq))
            } else {
                messages.push(makeCodexToolMessage(seq))
            }
        }
        // Add a text message at the beginning
        messages[0] = makeCodexTextMessage(1, 'hello')

        const api = createPagedApi(messages)
        await fetchLatestMessages(api, sid)

        const state = getMessageWindowState(sid)
        // All 600 raw messages should be retained since only 300 are visible (< 400)
        expect(state.messages.length).toBe(600)
    })
})
