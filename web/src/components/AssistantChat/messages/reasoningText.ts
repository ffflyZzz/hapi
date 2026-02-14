import { isObject } from '@hapi/protocol'
import type { ToolCallBlock } from '@/chat/types'

const MAX_DEPTH = 5

function isPlaceholderText(value: string): boolean {
    const compact = value.replace(/\s+/g, '')
    return compact === '{'
        || compact === '}'
        || compact === '{}'
        || compact === '[]'
}

function looksLikeJson(value: string): boolean {
    const trimmed = value.trim()
    if (!trimmed) return false

    return (
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
        || (trimmed.startsWith('[') && trimmed.endsWith(']'))
    )
}

function parseJsonMaybe(value: string): unknown | null {
    if (!looksLikeJson(value)) return null

    try {
        return JSON.parse(value)
    } catch {
        return null
    }
}

function extractFromObject(value: Record<string, unknown>, depth: number): string {
    const directKeys = [
        'content',
        'text',
        'reasoning',
        'thinking',
        'summary',
        'message',
        'analysis',
        'details',
        'formatted_output',
        'aggregated_output',
        'stdout',
        'stderr'
    ] as const
    for (const key of directKeys) {
        const text = extractReasoningText(value[key], depth + 1)
        if (text) return text
    }

    if (Array.isArray(value.content)) {
        const fromContent = extractReasoningText(value.content, depth + 1)
        if (fromContent) return fromContent
    }

    const nestedKeys = ['result', 'data', 'output', 'response', 'payload', 'delta', 'body'] as const
    for (const key of nestedKeys) {
        const nested = extractReasoningText(value[key], depth + 1)
        if (nested) return nested
    }

    if (typeof value.title === 'string' && value.title.trim().length > 0) {
        return value.title.trim()
    }

    return ''
}

export function extractReasoningText(value: unknown, depth: number = 0): string {
    if (depth > MAX_DEPTH || value === null || value === undefined) return ''

    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (!trimmed || isPlaceholderText(trimmed)) return ''

        const parsed = parseJsonMaybe(trimmed)
        if (parsed !== null) {
            const parsedText = extractReasoningText(parsed, depth + 1)
            return parsedText.trim()
        }

        return trimmed
    }

    if (Array.isArray(value)) {
        const parts = value
            .map((entry) => extractReasoningText(entry, depth + 1))
            .filter((entry) => entry.length > 0)
        return parts.join('\n').trim()
    }

    if (!isObject(value)) return ''

    return extractFromObject(value, depth)
}

export function normalizeReasoningText(value: unknown): string {
    return extractReasoningText(value).trim()
}

export function extractReasoningFromTool(block: ToolCallBlock): string {
    const fromResult = normalizeReasoningText(block.tool.result)
    if (fromResult.length > 0) return fromResult

    const fromInput = normalizeReasoningText(block.tool.input)
    if (fromInput.length > 0) return fromInput

    if (isObject(block.tool.result) && typeof block.tool.result.status === 'string') {
        const status = block.tool.result.status.trim()
        if (status.length > 0) {
            return `状态: ${status}`
        }
    }

    return ''
}
