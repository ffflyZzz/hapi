import { describe, expect, it } from 'vitest'
import type { ToolCallBlock } from '@/chat/types'
import { extractReasoningFromTool, normalizeReasoningText } from '@/components/AssistantChat/messages/reasoningText'

function makeReasoningBlock(input: unknown, result: unknown): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: 'reasoning-1',
        localId: null,
        createdAt: 1,
        children: [],
        tool: {
            id: 'reasoning-1',
            name: 'CodexReasoning',
            state: 'completed',
            createdAt: 1,
            startedAt: 1,
            completedAt: 2,
            input,
            result,
            description: null
        }
    }
}

describe('normalizeReasoningText', () => {
    it('returns empty string for placeholder braces', () => {
        expect(normalizeReasoningText('{')).toBe('')
        expect(normalizeReasoningText('{}')).toBe('')
    })

    it('extracts content from JSON string payload', () => {
        const payload = '{"content":"步骤一\\n步骤二","status":"completed"}'
        expect(normalizeReasoningText(payload)).toBe('步骤一\n步骤二')
    })
})

describe('extractReasoningFromTool', () => {
    it('falls back to input title when result is empty payload', () => {
        const block = makeReasoningBlock(
            { title: 'Analyzing UI rendering' },
            { content: '', status: 'completed' }
        )

        expect(extractReasoningFromTool(block)).toBe('Analyzing UI rendering')
    })

    it('returns readable result text when available', () => {
        const block = makeReasoningBlock(
            { title: 'Ignored title' },
            { content: 'Final reasoning detail', status: 'completed' }
        )

        expect(extractReasoningFromTool(block)).toBe('Final reasoning detail')
    })
})
