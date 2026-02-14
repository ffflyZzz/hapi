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
})
