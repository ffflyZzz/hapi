import type { ReactNode } from 'react'
import { isObject } from '@hapi/protocol'

export type ChecklistStatus = 'pending' | 'in_progress' | 'completed'

export type ChecklistItem = {
    id?: string
    text: string
    status: ChecklistStatus
}

export type UpdatePlanState = {
    explanation: string | null
    draft: string | null
    items: ChecklistItem[]
}

function normalizeChecklistStatus(value: unknown): ChecklistStatus {
    if (value === 'completed') return 'completed'
    if (value === 'in_progress') return 'in_progress'
    return 'pending'
}

function parseChecklistEntries(
    entries: unknown,
    opts: {
        textKey: 'content' | 'step'
        idKey?: string
    }
): ChecklistItem[] {
    if (!Array.isArray(entries)) return []

    const items: ChecklistItem[] = []
    for (const entry of entries) {
        if (!isObject(entry)) continue

        const text = entry[opts.textKey]
        if (typeof text !== 'string') continue

        const idValue = opts.idKey ? entry[opts.idKey] : undefined
        items.push({
            id: typeof idValue === 'string' ? idValue : undefined,
            text,
            status: normalizeChecklistStatus(entry.status)
        })
    }

    return items
}

export function extractTodoChecklist(input: unknown, result: unknown): ChecklistItem[] {
    if (isObject(input) && Array.isArray(input.todos)) {
        const items = parseChecklistEntries(input.todos, {
            textKey: 'content',
            idKey: 'id'
        })
        if (items.length > 0) return items
    }

    if (isObject(result) && Array.isArray(result.newTodos)) {
        return parseChecklistEntries(result.newTodos, {
            textKey: 'content',
            idKey: 'id'
        })
    }

    return []
}

export function extractUpdatePlanChecklist(input: unknown, result: unknown): ChecklistItem[] {
    return extractUpdatePlanState(input, result).items
}

export function extractUpdatePlanState(input: unknown, result: unknown): UpdatePlanState {
    const inputRecord = isObject(input) ? input : null
    const resultRecord = isObject(result) ? result : null

    const explanation = typeof inputRecord?.explanation === 'string'
        ? inputRecord.explanation
        : typeof resultRecord?.explanation === 'string'
            ? resultRecord.explanation
            : null

    const draft = typeof inputRecord?.draft === 'string'
        ? inputRecord.draft
        : typeof resultRecord?.draft === 'string'
            ? resultRecord.draft
            : null

    const items = inputRecord && Object.prototype.hasOwnProperty.call(inputRecord, 'plan')
        ? parseChecklistEntries(inputRecord.plan, {
            textKey: 'step'
        })
        : resultRecord
            ? parseChecklistEntries(resultRecord.plan, {
                textKey: 'step'
            })
            : []

    return {
        explanation,
        draft,
        items
    }
}

export function summarizeChecklist(items: ChecklistItem[]): Record<ChecklistStatus, number> {
    return items.reduce<Record<ChecklistStatus, number>>((acc, item) => {
        acc[item.status] += 1
        return acc
    }, {
        pending: 0,
        in_progress: 0,
        completed: 0
    })
}

function checklistTone(item: ChecklistItem): string {
    if (item.status === 'completed') return 'text-emerald-600 line-through'
    if (item.status === 'in_progress') return 'text-[var(--app-link)]'
    return 'text-[var(--app-hint)]'
}

function checklistIcon(item: ChecklistItem): ReactNode {
    if (item.status === 'completed') return '☑'
    return '☐'
}

export function ChecklistList(props: { items: ChecklistItem[]; emptyLabel?: string | null }) {
    if (props.items.length === 0) {
        return props.emptyLabel ? (
            <div className="text-sm text-[var(--app-hint)]">{props.emptyLabel}</div>
        ) : null
    }

    return (
        <div className="flex flex-col gap-1">
            {props.items.map((item, idx) => {
                const text = item.text.trim().length > 0 ? item.text.trim() : '(empty)'
                return (
                    <div key={item.id ?? String(idx)} className={`text-sm ${checklistTone(item)}`}>
                        {checklistIcon(item)} {text}
                    </div>
                )
            })}
        </div>
    )
}
