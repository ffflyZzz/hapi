import { isObject } from '@hapi/protocol'
import { unwrapRoleWrappedRecordEnvelope } from '@hapi/protocol/messages'
import { TodoItemSchema, TodosSchema } from '@hapi/protocol/schemas'
import type { TodoItem } from '@hapi/protocol/types'

export { TodoItemSchema, TodosSchema }
export type { TodoItem }

function extractTodosFromClaudeOutput(content: Record<string, unknown>): TodoItem[] | null {
    if (content.type !== 'output') return null

    const data = isObject(content.data) ? content.data : null
    if (!data || data.type !== 'assistant') return null

    const message = isObject(data.message) ? data.message : null
    if (!message) return null

    const modelContent = message.content
    if (!Array.isArray(modelContent)) return null

    for (const block of modelContent) {
        if (!isObject(block) || block.type !== 'tool_use') continue
        const name = typeof block.name === 'string' ? block.name : null
        const input = 'input' in block ? (block as Record<string, unknown>).input : null
        if (!isObject(input)) continue

        if (name === 'TodoWrite') {
            const todosCandidate = input.todos
            const parsed = TodosSchema.safeParse(todosCandidate)
            if (parsed.success) {
                return parsed.data
            }
        }

        if (name === 'update_plan') {
            const todos = extractTodosFromPlanInput(input)
            if (todos) {
                return todos
            }
        }
    }

    return null
}

function extractTodosFromCodexMessage(content: Record<string, unknown>): TodoItem[] | null {
    if (content.type !== 'codex') return null

    const data = isObject(content.data) ? content.data : null
    if (!data || data.type !== 'tool-call') return null

    const name = typeof data.name === 'string' ? data.name : null
    const input = 'input' in data ? (data as Record<string, unknown>).input : null
    if (!isObject(input)) return null

    if (name === 'TodoWrite') {
        const todosCandidate = input.todos
        const parsed = TodosSchema.safeParse(todosCandidate)
        return parsed.success ? parsed.data : null
    }

    if (name === 'update_plan') {
        return extractTodosFromPlanInput(input)
    }

    return null
}

function normalizePlanStatus(value: unknown): 'pending' | 'in_progress' | 'completed' {
    if (value === 'completed') return 'completed'
    if (value === 'in_progress' || value === 'inProgress') return 'in_progress'
    return 'pending'
}

function extractTodosFromPlanInput(input: Record<string, unknown>): TodoItem[] | null {
    if (!Array.isArray(input.plan)) return null

    const todos: TodoItem[] = []
    input.plan.forEach((entry, index) => {
        if (!isObject(entry)) return
        const step = typeof entry.step === 'string' ? entry.step : null
        if (!step) return
        const id = typeof entry.id === 'string' ? entry.id : `plan-${index + 1}`
        todos.push({
            id,
            content: step,
            priority: 'medium',
            status: normalizePlanStatus(entry.status)
        })
    })

    const parsed = TodosSchema.safeParse(todos)
    return parsed.success ? parsed.data : null
}

function extractTodosFromAcpMessage(content: Record<string, unknown>): TodoItem[] | null {
    if (content.type !== 'codex') return null

    const data = isObject(content.data) ? content.data : null
    if (!data || data.type !== 'plan') return null

    const entries = data.entries
    if (!Array.isArray(entries)) return null

    const todos: TodoItem[] = []
    entries.forEach((entry, index) => {
        if (!isObject(entry)) return
        const contentValue = typeof entry.content === 'string' ? entry.content : null
        const priorityValue = typeof entry.priority === 'string' ? entry.priority : null
        const statusValue = typeof entry.status === 'string' ? entry.status : null
        if (!contentValue || !priorityValue || !statusValue) return
        if (priorityValue !== 'high' && priorityValue !== 'medium' && priorityValue !== 'low') return
        if (statusValue !== 'pending' && statusValue !== 'in_progress' && statusValue !== 'completed') return

        const idValue = typeof entry.id === 'string' ? entry.id : `plan-${index + 1}`

        todos.push({
            content: contentValue,
            priority: priorityValue,
            status: statusValue,
            id: idValue
        })
    })

    const parsed = TodosSchema.safeParse(todos)
    return parsed.success ? parsed.data : null
}

export function extractTodoWriteTodosFromMessageContent(messageContent: unknown): TodoItem[] | null {
    const record = unwrapRoleWrappedRecordEnvelope(messageContent)
    if (!record) return null

    if (record.role !== 'agent' && record.role !== 'assistant') return null

    if (!isObject(record.content) || typeof record.content.type !== 'string') return null

    return extractTodosFromClaudeOutput(record.content)
        ?? extractTodosFromCodexMessage(record.content)
        ?? extractTodosFromAcpMessage(record.content)
}
