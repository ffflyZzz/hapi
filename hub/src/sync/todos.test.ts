import { describe, expect, it } from 'bun:test'
import { extractTodoWriteTodosFromMessageContent } from './todos'

describe('extractTodoWriteTodosFromMessageContent', () => {
    it('maps Codex update_plan tool calls to todo progress entries', () => {
        const todos = extractTodoWriteTodosFromMessageContent({
            role: 'assistant',
            content: {
                type: 'codex',
                data: {
                    type: 'tool-call',
                    name: 'update_plan',
                    input: {
                        explanation: 'Keep the rollout focused and verify each milestone.',
                        plan: [
                            { step: 'Add routes', status: 'completed' },
                            { step: 'Render plan card', status: 'in_progress' },
                            { step: 'Ship it', status: 'pending' }
                        ]
                    }
                }
            }
        })

        expect(todos).toEqual([
            { id: 'plan-1', content: 'Add routes', priority: 'medium', status: 'completed' },
            { id: 'plan-2', content: 'Render plan card', priority: 'medium', status: 'in_progress' },
            { id: 'plan-3', content: 'Ship it', priority: 'medium', status: 'pending' }
        ])
    })
})
