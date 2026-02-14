import { useCallback, useMemo } from 'react'
import type { AppendMessage, AttachmentAdapter, ThreadMessageLike } from '@assistant-ui/react'
import { useExternalMessageConverter, useExternalStoreRuntime } from '@assistant-ui/react'
import { safeStringify } from '@hapi/protocol'
import { renderEventLabel } from '@/chat/presentation'
import type { ChatBlock, CliOutputBlock } from '@/chat/types'
import type { AgentEvent, ToolCallBlock } from '@/chat/types'
import type { AttachmentMetadata, MessageStatus as HappyMessageStatus, Session } from '@/types/api'

export type HappyChatMessageMetadata = {
    kind: 'user' | 'assistant' | 'tool' | 'event' | 'cli-output' | 'tool-group'
    status?: HappyMessageStatus
    localId?: string | null
    originalText?: string
    toolCallId?: string
    event?: AgentEvent
    source?: CliOutputBlock['source']
    attachments?: AttachmentMetadata[]
    groupBlocks?: ChatBlock[]
    isLastToolGroup?: boolean
    thinking?: boolean
}

type ToolGroupBlock = {
    kind: 'tool-group'
    id: string
    createdAt: number
    blocks: ChatBlock[]
    isLast: boolean
    thinking: boolean
}

type RenderBlock = ChatBlock | ToolGroupBlock

function isToolGroupCandidate(block: ChatBlock): boolean {
    return block.kind === 'tool-call' || block.kind === 'agent-reasoning'
}

function shouldGroupToolBlocks(blocks: ChatBlock[]): boolean {
    if (blocks.length < 2) return false
    return blocks.some((block) => block.kind === 'tool-call')
}

function groupConsecutiveToolBlocks(blocks: readonly ChatBlock[], thinking: boolean): RenderBlock[] {
    const grouped: RenderBlock[] = []
    let idx = 0

    while (idx < blocks.length) {
        const current = blocks[idx]
        if (!isToolGroupCandidate(current)) {
            grouped.push(current)
            idx += 1
            continue
        }

        const run: ChatBlock[] = [current]
        idx += 1
        while (idx < blocks.length && isToolGroupCandidate(blocks[idx])) {
            run.push(blocks[idx])
            idx += 1
        }

        if (shouldGroupToolBlocks(run)) {
            grouped.push({
                kind: 'tool-group',
                id: run[0]!.id,
                createdAt: run[0]!.createdAt,
                blocks: run,
                isLast: false,
                thinking
            })
        } else {
            grouped.push(...run)
        }
    }

    // Mark the last tool-group
    for (let i = grouped.length - 1; i >= 0; i--) {
        if (grouped[i].kind === 'tool-group') {
            ;(grouped[i] as ToolGroupBlock).isLast = true
            break
        }
    }

    return grouped
}

function toThreadMessageLike(block: RenderBlock): ThreadMessageLike {
    if (block.kind === 'tool-group') {
        const messageId = `tool-group:${block.id}`
        const msg: ThreadMessageLike = {
            role: 'assistant',
            id: messageId,
            createdAt: new Date(block.createdAt),
            content: [{ type: 'text', text: '' }],
            metadata: {
                custom: {
                    kind: 'tool-group',
                    groupBlocks: block.blocks,
                    isLastToolGroup: block.isLast,
                    thinking: block.thinking
                } satisfies HappyChatMessageMetadata
            }
        }
        // Prevent assistant-ui from merging this message with subsequent assistant messages.
        // convertConfig is supported at runtime but not in the ThreadMessageLike type definition.
        ;(msg as Record<string, unknown>).convertConfig = { joinStrategy: 'none' }
        return msg
    }

    if (block.kind === 'user-text') {
        const messageId = `user:${block.id}`
        return {
            role: 'user',
            id: messageId,
            createdAt: new Date(block.createdAt),
            content: [{ type: 'text', text: block.text }],
            metadata: {
                custom: {
                    kind: 'user',
                    status: block.status,
                    localId: block.localId,
                    originalText: block.originalText,
                    attachments: block.attachments
                } satisfies HappyChatMessageMetadata
            }
        }
    }

    if (block.kind === 'agent-text') {
        const messageId = `assistant:${block.id}`
        const msg: ThreadMessageLike = {
            role: 'assistant',
            id: messageId,
            createdAt: new Date(block.createdAt),
            content: [{ type: 'text', text: block.text }],
            metadata: {
                custom: { kind: 'assistant' } satisfies HappyChatMessageMetadata
            }
        }
        ;(msg as Record<string, unknown>).convertConfig = { joinStrategy: 'none' }
        return msg
    }

    if (block.kind === 'agent-reasoning') {
        const messageId = `assistant:${block.id}`
        return {
            role: 'assistant',
            id: messageId,
            createdAt: new Date(block.createdAt),
            content: [{ type: 'reasoning', text: block.text }],
            metadata: {
                custom: { kind: 'assistant' } satisfies HappyChatMessageMetadata
            }
        }
    }

    if (block.kind === 'agent-event') {
        const messageId = `event:${block.id}`
        return {
            role: 'system',
            id: messageId,
            createdAt: new Date(block.createdAt),
            content: [{ type: 'text', text: renderEventLabel(block.event) }],
            metadata: {
                custom: { kind: 'event', event: block.event } satisfies HappyChatMessageMetadata
            }
        }
    }

    if (block.kind === 'cli-output') {
        const messageId = `cli:${block.id}`
        return {
            role: block.source === 'user' ? 'user' : 'assistant',
            id: messageId,
            createdAt: new Date(block.createdAt),
            content: [{ type: 'text', text: block.text }],
            metadata: {
                custom: { kind: 'cli-output', source: block.source } satisfies HappyChatMessageMetadata
            }
        }
    }

    const toolBlock: ToolCallBlock = block
    const messageId = `tool:${toolBlock.id}`
    const inputText = safeStringify(toolBlock.tool.input)

    return {
        role: 'assistant',
        id: messageId,
        createdAt: new Date(toolBlock.createdAt),
        content: [{
            type: 'tool-call',
            toolCallId: toolBlock.id,
            toolName: toolBlock.tool.name,
            argsText: inputText,
            result: toolBlock.tool.result,
            isError: toolBlock.tool.state === 'error',
            artifact: toolBlock
        }],
        metadata: {
            custom: { kind: 'tool', toolCallId: toolBlock.id } satisfies HappyChatMessageMetadata
        }
    }
}

type TextMessagePart = { type: 'text'; text: string }

function getTextFromParts(parts: readonly { type: string }[] | undefined): string {
    if (!parts) return ''

    return parts
        .filter((part): part is TextMessagePart => part.type === 'text' && typeof (part as TextMessagePart).text === 'string')
        .map((part) => part.text)
        .join('\n')
        .trim()
}

type ExtractedAttachmentMetadata = { __attachmentMetadata: AttachmentMetadata }

function isAttachmentMetadataJson(text: string): ExtractedAttachmentMetadata | null {
    try {
        const parsed = JSON.parse(text) as unknown
        if (parsed && typeof parsed === 'object' && '__attachmentMetadata' in parsed) {
            return parsed as ExtractedAttachmentMetadata
        }
        return null
    } catch {
        return null
    }
}

function extractMessageContent(message: AppendMessage): { text: string; attachments: AttachmentMetadata[] } {
    if (message.role !== 'user') return { text: '', attachments: [] }

    // Extract attachments from attachment content
    const attachments: AttachmentMetadata[] = []
    const otherAttachmentTexts: string[] = []

    const attachmentParts = message.attachments?.flatMap((attachment) => attachment.content ?? []) ?? []
    for (const part of attachmentParts) {
        if (part.type === 'text' && typeof (part as TextMessagePart).text === 'string') {
            const textPart = part as TextMessagePart
            const extracted = isAttachmentMetadataJson(textPart.text)
            if (extracted) {
                attachments.push(extracted.__attachmentMetadata)
            } else {
                otherAttachmentTexts.push(textPart.text)
            }
        }
    }

    const contentText = getTextFromParts(message.content)
    const text = [otherAttachmentTexts.join('\n'), contentText]
        .filter((value) => value.length > 0)
        .join('\n\n')
        .trim()

    return { text, attachments }
}

export function useHappyRuntime(props: {
    session: Session
    blocks: readonly ChatBlock[]
    isSending: boolean
    onSendMessage: (text: string, attachments?: AttachmentMetadata[]) => void
    onAbort: () => Promise<void>
    attachmentAdapter?: AttachmentAdapter
    allowSendWhenInactive?: boolean
}) {
    const groupedBlocks = useMemo(
        () => groupConsecutiveToolBlocks(props.blocks, props.session.thinking),
        [props.blocks, props.session.thinking]
    )

    // Use cached message converter for performance optimization
    // This prevents re-converting all messages on every render
    const convertedMessages = useExternalMessageConverter<RenderBlock>({
        callback: toThreadMessageLike,
        messages: groupedBlocks as RenderBlock[],
        isRunning: props.session.thinking,
    })

    const onNew = useCallback(async (message: AppendMessage) => {
        const { text, attachments } = extractMessageContent(message)
        if (!text && attachments.length === 0) return
        props.onSendMessage(text, attachments.length > 0 ? attachments : undefined)
    }, [props.onSendMessage])

    const onCancel = useCallback(async () => {
        await props.onAbort()
    }, [props.onAbort])

    // Memoize the adapter to avoid recreating on every render
    // useExternalStoreRuntime may use adapter identity for subscriptions
    const adapter = useMemo(() => ({
        isDisabled: props.isSending || (!props.session.active && !props.allowSendWhenInactive),
        isRunning: props.session.thinking,
        messages: convertedMessages,
        onNew,
        onCancel,
        adapters: props.attachmentAdapter ? { attachments: props.attachmentAdapter } : undefined,
        unstable_capabilities: { copy: true }
    }), [
        props.session.active,
        props.isSending,
        props.allowSendWhenInactive,
        props.session.thinking,
        convertedMessages,
        onNew,
        onCancel,
        props.attachmentAdapter
    ])

    return useExternalStoreRuntime(adapter)
}
