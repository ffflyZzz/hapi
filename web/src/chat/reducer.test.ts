import { describe, expect, it } from 'vitest'
import type { AgentState } from '@/types/api'
import type { NormalizedMessage } from '@/chat/types'
import { reduceChatBlocks } from '@/chat/reducer'

function makeAgentTextMessage(createdAt: number): NormalizedMessage {
    return {
        id: `msg-${createdAt}`,
        localId: null,
        createdAt,
        role: 'agent',
        isSidechain: false,
        content: [{
            type: 'text',
            text: 'assistant text',
            uuid: `uuid-${createdAt}`,
            parentUUID: null
        }]
    }
}

describe('reduceChatBlocks permission fallback', () => {
    it('does not inject completed requests as synthetic tool cards', () => {
        const normalized: NormalizedMessage[] = [makeAgentTextMessage(1_000)]
        const agentState = {
            completedRequests: {
                'call-completed': {
                    tool: 'CodexBash',
                    arguments: { command: 'pwd' },
                    status: 'approved',
                    createdAt: 1_100,
                    completedAt: 1_200
                }
            }
        } as unknown as AgentState

        const reduced = reduceChatBlocks(normalized, agentState)
        const hasSyntheticCompletedCard = reduced.blocks.some((block) =>
            block.kind === 'tool-call' && block.id === 'call-completed'
        )

        expect(hasSyntheticCompletedCard).toBe(false)
    })

    it('keeps injecting pending permission requests when transcript is missing', () => {
        const normalized: NormalizedMessage[] = [makeAgentTextMessage(1_000)]
        const agentState = {
            requests: {
                'call-pending': {
                    tool: 'CodexBash',
                    arguments: { command: 'pwd' },
                    createdAt: 1_100
                }
            }
        } as unknown as AgentState

        const reduced = reduceChatBlocks(normalized, agentState)
        const pendingTool = reduced.blocks.find((block) =>
            block.kind === 'tool-call' && block.id === 'call-pending'
        )

        expect(pendingTool?.kind).toBe('tool-call')
        if (pendingTool?.kind === 'tool-call') {
            expect(pendingTool.tool.permission?.status).toBe('pending')
        }
    })
})
