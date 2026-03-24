import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ToolCallBlock } from '@/chat/types'
import { ChecklistList, extractTodoChecklist, extractUpdatePlanChecklist, extractUpdatePlanState } from '@/components/ToolCard/checklist'
import { getToolPresentation } from '@/components/ToolCard/knownTools'
import { getToolViewComponent } from '@/components/ToolCard/views/_all'
import { UpdatePlanView } from '@/components/ToolCard/views/UpdatePlanView'

function makeUpdatePlanBlock(input: unknown, result?: unknown): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: 'tool-1',
        localId: null,
        createdAt: 0,
        tool: {
            id: 'tool-1',
            name: 'update_plan',
            state: 'completed',
            input,
            createdAt: 0,
            startedAt: 0,
            completedAt: 0,
            description: null,
            result
        },
        children: []
    }
}

describe('extractUpdatePlanChecklist', () => {
    it('prefers input.plan over result.plan', () => {
        const items = extractUpdatePlanChecklist(
            {
                plan: [
                    { step: 'Patch root cause', status: 'completed' }
                ]
            },
            {
                plan: [
                    { step: 'Result fallback', status: 'pending' }
                ]
            }
        )

        expect(items).toEqual([
            { text: 'Patch root cause', status: 'completed', id: undefined }
        ])
    })

    it('falls back to result.plan when input.plan is absent', () => {
        const items = extractUpdatePlanChecklist(
            {},
            {
                plan: [
                    { step: 'Re-run build validation', status: 'in_progress' }
                ]
            }
        )

        expect(items).toEqual([
            { text: 'Re-run build validation', status: 'in_progress', id: undefined }
        ])
    })

    it('keeps valid steps and normalizes unknown status to pending', () => {
        const items = extractUpdatePlanChecklist(
            {
                plan: [
                    { step: 'Summarize fix', status: 'unknown_status' },
                    { step: 123, status: 'completed' },
                    { status: 'pending' }
                ]
            },
            null
        )

        expect(items).toEqual([
            { text: 'Summarize fix', status: 'pending', id: undefined }
        ])
    })
})

describe('extractUpdatePlanState', () => {
    it('returns explanation and plan items from update_plan input', () => {
        const state = extractUpdatePlanState(
            {
                explanation: 'Keep the rollout focused and verify each milestone.',
                plan: [
                    { step: 'Add routes', status: 'completed' },
                    { step: 'Render new plan card', status: 'in_progress' }
                ]
            },
            null
        )

        expect(state).toEqual({
            explanation: 'Keep the rollout focused and verify each milestone.',
            draft: null,
            items: [
                { text: 'Add routes', status: 'completed', id: undefined },
                { text: 'Render new plan card', status: 'in_progress', id: undefined }
            ]
        })
    })

    it('returns plan draft text when the update only contains streamed plan text', () => {
        const state = extractUpdatePlanState(
            {
                draft: '1. Inspect current config\\n2. Apply focused edit',
                isDraft: true
            },
            null
        )

        expect(state).toEqual({
            explanation: null,
            draft: '1. Inspect current config\\n2. Apply focused edit',
            items: []
        })
    })
})

describe('extractTodoChecklist', () => {
    it('uses result.newTodos when input.todos is unavailable', () => {
        const items = extractTodoChecklist(
            null,
            {
                newTodos: [
                    { id: 'todo-1', content: 'Ship it', status: 'completed' }
                ]
            }
        )

        expect(items).toEqual([
            { id: 'todo-1', text: 'Ship it', status: 'completed' }
        ])
    })
})

describe('update_plan tool presentation', () => {
    it('shows plan title, step count, and expanded body when steps exist', () => {
        const presentation = getToolPresentation({
            toolName: 'update_plan',
            input: {
                plan: [
                    { step: 'Reproduce web build failure', status: 'completed' },
                    { step: 'Trace broken build path', status: 'completed' }
                ]
            },
            result: undefined,
            childrenCount: 0,
            description: null,
            metadata: null
        })

        expect(presentation.title).toBe('Plan')
        expect(presentation.subtitle).toBe('2 steps')
        expect(presentation.minimal).toBe(false)
    })

    it('stays minimal when there are no valid steps', () => {
        const presentation = getToolPresentation({
            toolName: 'update_plan',
            input: { plan: [{ status: 'completed' }] },
            result: undefined,
            childrenCount: 0,
            description: null,
            metadata: null
        })

        expect(presentation.subtitle).toBeNull()
        expect(presentation.minimal).toBe(true)
    })

    it('renders draft plans as non-minimal cards', () => {
        const presentation = getToolPresentation({
            toolName: 'update_plan',
            input: { draft: 'Planning draft...', isDraft: true },
            result: undefined,
            childrenCount: 0,
            description: null,
            metadata: null
        })

        expect(presentation.title).toBe('Plan')
        expect(presentation.subtitle).toBe('Drafting…')
        expect(presentation.minimal).toBe(false)
    })
})

describe('UpdatePlanView', () => {
    it('renders checklist rows with status styling', () => {
        render(
            <UpdatePlanView
                block={makeUpdatePlanBlock({
                    plan: [
                        { step: 'Reproduce web build failure', status: 'completed' },
                        { step: 'Trace broken build path', status: 'in_progress' },
                        { step: 'Summarize fix', status: 'unknown_status' }
                    ]
                })}
                metadata={null}
            />
        )

        const completed = screen.getByText(/Reproduce web build failure/)
        const inProgress = screen.getByText(/Trace broken build path/)
        const pending = screen.getByText(/Summarize fix/)

        expect(completed).toBeInTheDocument()
        expect(completed.className).toContain('line-through')
        expect(inProgress.className).toContain('text-[var(--app-link)]')
        expect(pending.className).toContain('text-[var(--app-hint)]')
    })

    it('renders explanation and status summary badges', () => {
        render(
            <UpdatePlanView
                block={makeUpdatePlanBlock({
                    explanation: 'Keep the rollout focused and verify each milestone.',
                    plan: [
                        { step: 'Add routes', status: 'completed' },
                        { step: 'Render new plan card', status: 'in_progress' },
                        { step: 'Ship it', status: 'pending' }
                    ]
                })}
                metadata={null}
            />
        )

        expect(screen.getByText('Keep the rollout focused and verify each milestone.')).toBeInTheDocument()
        expect(screen.getAllByText('1 completed').length).toBeGreaterThan(0)
        expect(screen.getAllByText('1 in progress').length).toBeGreaterThan(0)
        expect(screen.getAllByText('1 pending').length).toBeGreaterThan(0)
    })

    it('renders streamed plan draft text', () => {
        render(
            <UpdatePlanView
                block={makeUpdatePlanBlock({
                    draft: '1. Inspect current config\n2. Apply focused edit',
                    isDraft: true
                })}
                metadata={null}
            />
        )

        expect(screen.getByText('Drafting plan…')).toBeInTheDocument()
        expect(screen.getByText(/Inspect current config/)).toBeInTheDocument()
    })

    it('is registered as the compact tool view', () => {
        expect(getToolViewComponent('update_plan')).toBe(UpdatePlanView)
    })
})

describe('ChecklistList', () => {
    it('renders blank steps as empty placeholders', () => {
        render(
            <ChecklistList
                items={[
                    { text: '   ', status: 'pending' }
                ]}
            />
        )

        expect(screen.getByText(/\(empty\)/)).toBeInTheDocument()
    })
})
