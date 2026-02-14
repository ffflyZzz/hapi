import { useMemo, useState, type ReactNode } from 'react'
import { MessagePrimitive, useMessage } from '@assistant-ui/react'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { Reasoning, ReasoningGroup } from '@/components/assistant-ui/reasoning'
import { HappyToolBlock, HappyToolMessage } from '@/components/AssistantChat/messages/ToolMessage'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import type { ChatBlock, ToolCallBlock } from '@/chat/types'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { getToolPresentation } from '@/components/ToolCard/knownTools'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'
import { extractReasoningFromTool, normalizeReasoningText } from '@/components/AssistantChat/messages/reasoningText'

function AssistantTextBubble() {
    return (
        <div className="my-1.5 mr-auto w-fit min-w-0 max-w-[92%] rounded-xl bg-[var(--app-secondary-bg)] px-3 py-2 text-[var(--app-fg)] shadow-sm">
            <MarkdownText />
        </div>
    )
}

const TOOL_COMPONENTS = {
    Fallback: HappyToolMessage
} as const

const MESSAGE_PART_COMPONENTS = {
    Text: AssistantTextBubble,
    Reasoning: Reasoning,
    ReasoningGroup: ReasoningGroup,
    tools: TOOL_COMPONENTS
} as const

function getToolTitle(block: ToolCallBlock): string {
    return getToolPresentation({
        toolName: block.tool.name,
        input: block.tool.input,
        result: block.tool.result,
        childrenCount: block.children.length,
        description: block.tool.description,
        metadata: null
    }).title
}

function ReasoningCard(props: { text: string }) {
    const content = props.text.trim().length > 0 ? props.text : '(暂无详细内容)'
    const summary = content
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? '(暂无详细内容)'

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    type="button"
                    className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-secondary-bg)] px-3 py-2 text-left shadow-sm"
                >
                    <div className="text-sm font-medium text-[var(--app-fg)]">Reasoning</div>
                    <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--app-hint)]">
                        {summary}
                    </div>
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Reasoning</DialogTitle>
                </DialogHeader>
                <div className="mt-2 max-h-[70vh] overflow-auto">
                    <MarkdownRenderer content={content} />
                </div>
            </DialogContent>
        </Dialog>
    )
}

function TimelineNode(props: {
    showConnector: boolean
    children: ReactNode
}) {
    return (
        <div className="flex gap-2">
            <div className="flex w-3 shrink-0 flex-col items-center">
                <span className="mt-1 h-2 w-2 rounded-full bg-[var(--app-border)]" />
                {props.showConnector ? <span className="mt-1 h-full w-px bg-[var(--app-border)]" /> : null}
            </div>
            {props.children}
        </div>
    )
}

function ToolGroupMessage(props: { blocks: ChatBlock[]; defaultExpanded: boolean }) {
    const [expanded, setExpanded] = useState(props.defaultExpanded)
    const items = useMemo(() => {
        const entries: Array<
            | { type: 'tool'; id: string; title: string; block: ToolCallBlock }
            | { type: 'reasoning'; id: string; text: string }
        > = []

        for (const block of props.blocks) {
            if (block.kind === 'agent-reasoning') {
                const reasoningText = normalizeReasoningText(block.text)
                entries.push({
                    type: 'reasoning',
                    id: `agent-reasoning:${block.id}`,
                    text: reasoningText
                })
                continue
            }

            if (block.kind === 'tool-call' && block.tool.name === 'CodexReasoning') {
                entries.push({
                    type: 'reasoning',
                    id: `reasoning-tool:${block.id}`,
                    text: extractReasoningFromTool(block)
                })
                continue
            }

            if (block.kind === 'tool-call') {
                entries.push({
                    type: 'tool',
                    id: `tool:${block.id}`,
                    title: getToolTitle(block),
                    block
                })
            }
        }

        return entries
    }, [props.blocks])
    const toolCount = items.filter((item) => item.type === 'tool').length

    return (
        <div className="px-1 min-w-0 max-w-full overflow-x-hidden">
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] shadow-sm overflow-hidden">
                <button
                    type="button"
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
                    onClick={() => setExpanded((prev) => !prev)}
                >
                    <span className="text-sm font-medium text-[var(--app-fg)]">
                        Tool Call（{toolCount}）
                    </span>
                    <span className="text-xs text-[var(--app-hint)]">
                        {expanded ? '▼ 收起' : '▶ 展开'}
                    </span>
                </button>

                {expanded ? (
                    <div className="border-t border-[var(--app-border)] px-3 py-3">
                        <div className="flex flex-col gap-2">
                            {items.map((item, idx) => {
                                const showConnector = idx < items.length - 1

                                if (item.type === 'reasoning') {
                                    return (
                                        <TimelineNode key={item.id} showConnector={showConnector}>
                                            <div className="min-w-0 flex-1 pb-2">
                                                <ReasoningCard text={item.text} />
                                            </div>
                                        </TimelineNode>
                                    )
                                }

                                return (
                                    <TimelineNode key={item.id} showConnector={showConnector}>
                                        <div className="min-w-0 flex-1 pb-2">
                                            <div className="mb-1 pl-0.5 text-xs font-medium text-[var(--app-hint)]">
                                                {item.title}
                                            </div>
                                            <HappyToolBlock block={item.block} />
                                        </div>
                                    </TimelineNode>
                                )
                            })}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    )
}

export function HappyAssistantMessage() {
    const message = useMessage()
    const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
    const isCliOutput = custom?.kind === 'cli-output'
    const toolGroupBlocks = custom?.kind === 'tool-group' ? (custom.groupBlocks ?? null) : null

    const cliText = useMemo(() => {
        if (custom?.kind !== 'cli-output') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    }, [custom?.kind, message.content])

    const toolOnly = message.role === 'assistant'
        && message.content.length > 0
        && message.content.every((part) => part.type === 'tool-call')

    const rootClass = toolOnly
        ? 'py-1 min-w-0 max-w-full overflow-x-hidden'
        : 'px-1 min-w-0 max-w-full overflow-x-hidden'

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root className="px-1 min-w-0 max-w-full overflow-x-hidden">
                <CliOutputBlock text={cliText} />
            </MessagePrimitive.Root>
        )
    }

    if (toolGroupBlocks && toolGroupBlocks.length > 0) {
        const isLastToolGroup = custom?.isLastToolGroup === true
        const thinking = custom?.thinking === true
        const defaultExpanded = isLastToolGroup && thinking
        return (
            <MessagePrimitive.Root className="py-1 min-w-0 max-w-full overflow-x-hidden">
                <ToolGroupMessage blocks={toolGroupBlocks} defaultExpanded={defaultExpanded} />
            </MessagePrimitive.Root>
        )
    }

    return (
        <MessagePrimitive.Root className={rootClass}>
            <MessagePrimitive.Content components={MESSAGE_PART_COMPONENTS} />
        </MessagePrimitive.Root>
    )
}
