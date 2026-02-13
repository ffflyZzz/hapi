import { describe, expect, it, vi } from 'vitest';
import { AppServerEventConverter } from './appServerEventConverter';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

describe('AppServerEventConverter', () => {
    it('maps thread lifecycle events', () => {
        const converter = new AppServerEventConverter();

        expect(converter.handleNotification('thread/started', { thread: { id: 'thread-1' } }))
            .toEqual([{ type: 'thread_started', thread_id: 'thread-1' }]);

        expect(converter.handleNotification('thread/resumed', { thread: { id: 'thread-2' } }))
            .toEqual([{ type: 'thread_started', thread_id: 'thread-2' }]);
    });

    it('maps turn start and completion statuses with stable fields', () => {
        const converter = new AppServerEventConverter();

        const started = converter.handleNotification('turn/started', {
            threadId: 'thread-1',
            turn: { id: 'turn-1' }
        });
        expect(started).toEqual([{ type: 'task_started', turn_id: 'turn-1', thread_id: 'thread-1' }]);

        const completed = converter.handleNotification('turn/completed', {
            turn: { id: 'turn-1', threadId: 'thread-1' },
            status: 'Completed'
        });
        expect(completed).toEqual([{ type: 'task_complete', turn_id: 'turn-1', thread_id: 'thread-1', status: 'Completed' }]);

        const interrupted = converter.handleNotification('turn/completed', {
            turn: { id: 'turn-1', threadId: 'thread-1' },
            status: 'Interrupted'
        });
        expect(interrupted).toEqual([{ type: 'turn_aborted', turn_id: 'turn-1', thread_id: 'thread-1', status: 'Interrupted' }]);

        const failed = converter.handleNotification('turn/completed', {
            threadId: 'thread-1',
            turn: { id: 'turn-1' },
            status: 'Failed',
            message: 'boom'
        });
        expect(failed).toEqual([{ type: 'task_failed', turn_id: 'turn-1', error: 'boom', thread_id: 'thread-1', status: 'Failed' }]);
    });

    it('maps turn plan updates', () => {
        const converter = new AppServerEventConverter();

        const events = converter.handleNotification('turn/plan/updated', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            explanation: 'doing steps',
            plan: [
                { step: 'A', status: 'pending' },
                { step: 'B', status: 'inProgress' }
            ]
        });

        expect(events).toEqual([{
            type: 'turn_plan_updated',
            explanation: 'doing steps',
            plan: [
                { step: 'A', status: 'pending' },
                { step: 'B', status: 'inProgress' }
            ],
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);
    });

    it('accumulates agent message deltas', () => {
        const converter = new AppServerEventConverter();

        converter.handleNotification('item/agentMessage/delta', { itemId: 'msg-1', delta: 'Hello' });
        converter.handleNotification('item/agentMessage/delta', { itemId: 'msg-1', delta: ' world' });
        const completed = converter.handleNotification('item/completed', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'msg-1', type: 'agentMessage', status: 'completed' }
        });

        expect(completed).toEqual([{ type: 'agent_message', message: 'Hello world', item_id: 'msg-1', status: 'completed', thread_id: 'thread-1', turn_id: 'turn-1' }]);
    });

    it('maps plan deltas and plan item lifecycle', () => {
        const converter = new AppServerEventConverter();

        const delta = converter.handleNotification('item/plan/delta', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            itemId: 'plan-1',
            delta: 'Step A'
        });
        expect(delta).toEqual([{
            type: 'agent_plan_delta',
            item_id: 'plan-1',
            delta: 'Step A',
            plan_text: 'Step A',
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);

        const started = converter.handleNotification('item/started', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'plan-1', type: 'plan', status: 'inProgress' }
        });
        expect(started).toEqual([{
            type: 'plan_item_started',
            call_id: 'plan-1',
            item_id: 'plan-1',
            status: 'inProgress',
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);

        const completed = converter.handleNotification('item/completed', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'plan-1', type: 'plan', text: 'Final plan', status: 'completed' }
        });
        expect(completed).toEqual([{
            type: 'plan_item_completed',
            call_id: 'plan-1',
            item_id: 'plan-1',
            text: 'Final plan',
            status: 'completed',
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);
    });

    it('maps reasoning deltas from raw and summary streams', () => {
        const converter = new AppServerEventConverter();

        const raw = converter.handleNotification('item/reasoning/textDelta', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            itemId: 'r1',
            delta: 'raw'
        });
        expect(raw).toEqual([{ type: 'agent_reasoning_delta', delta: 'raw', item_id: 'r1', reasoning_stream: 'raw', thread_id: 'thread-1', turn_id: 'turn-1' }]);

        const summary = converter.handleNotification('item/reasoning/summaryTextDelta', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            itemId: 'r1',
            summaryIndex: 2,
            delta: 'summary'
        });
        expect(summary).toEqual([{ type: 'agent_reasoning_delta', delta: 'summary', item_id: 'r1', reasoning_stream: 'summary', summary_index: 2, thread_id: 'thread-1', turn_id: 'turn-1' }]);

        const separator = converter.handleNotification('item/reasoning/summaryPartAdded', {
            threadId: 'thread-1',
            turnId: 'turn-1'
        });
        expect(separator).toEqual([{ type: 'agent_reasoning_section_break', thread_id: 'thread-1', turn_id: 'turn-1' }]);
    });

    it('maps command execution items and output deltas', () => {
        const converter = new AppServerEventConverter();

        const started = converter.handleNotification('item/started', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'cmd-1', type: 'commandExecution', command: 'ls', status: 'inProgress' }
        });
        expect(started).toEqual([{
            type: 'exec_command_begin',
            call_id: 'cmd-1',
            item_id: 'cmd-1',
            command: 'ls',
            thread_id: 'thread-1',
            turn_id: 'turn-1',
            status: 'inProgress'
        }]);

        converter.handleNotification('item/commandExecution/outputDelta', { itemId: 'cmd-1', delta: 'ok' });
        const completed = converter.handleNotification('item/completed', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'cmd-1', type: 'commandExecution', exitCode: 0, status: 'completed' }
        });

        expect(completed).toEqual([{
            type: 'exec_command_end',
            call_id: 'cmd-1',
            item_id: 'cmd-1',
            command: 'ls',
            thread_id: 'thread-1',
            turn_id: 'turn-1',
            output: 'ok',
            exit_code: 0,
            status: 'completed'
        }]);
    });

    it('maps file change output deltas and completion', () => {
        const converter = new AppServerEventConverter();

        const started = converter.handleNotification('item/started', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: {
                id: 'patch-1',
                type: 'fileChange',
                changes: [{ path: 'a.ts', kind: 'modify' }],
                status: 'inProgress'
            }
        });
        expect(started).toEqual([{
            type: 'patch_apply_begin',
            call_id: 'patch-1',
            item_id: 'patch-1',
            changes: {
                'a.ts': { path: 'a.ts', kind: 'modify' }
            },
            thread_id: 'thread-1',
            turn_id: 'turn-1',
            status: 'inProgress'
        }]);

        const delta = converter.handleNotification('item/fileChange/outputDelta', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            itemId: 'patch-1',
            delta: '{"ok":true}'
        });
        expect(delta).toEqual([{
            type: 'patch_apply_delta',
            item_id: 'patch-1',
            delta: '{"ok":true}',
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);

        const completed = converter.handleNotification('item/completed', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'patch-1', type: 'fileChange', status: 'completed' }
        });
        expect(completed).toEqual([{
            type: 'patch_apply_end',
            call_id: 'patch-1',
            item_id: 'patch-1',
            changes: {
                'a.ts': { path: 'a.ts', kind: 'modify' }
            },
            thread_id: 'thread-1',
            turn_id: 'turn-1',
            stdout: '{"ok":true}',
            success: true,
            status: 'completed'
        }]);
    });

    it('maps mcp/review/context/web/image/collab items', () => {
        const converter = new AppServerEventConverter();

        const mcpStart = converter.handleNotification('item/started', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'm1', type: 'mcpToolCall', server: 'github', tool: 'issues.list', arguments: { a: 1 } }
        });
        expect(mcpStart).toEqual([{
            type: 'mcp_tool_call_begin',
            call_id: 'm1',
            item_id: 'm1',
            name: 'mcp__github__issues.list',
            input: { a: 1 },
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);

        const mcpEnd = converter.handleNotification('item/completed', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'm1', type: 'mcpToolCall', server: 'github', tool: 'issues.list', result: { ok: true }, status: 'completed' }
        });
        expect(mcpEnd).toEqual([{
            type: 'mcp_tool_call_end',
            call_id: 'm1',
            item_id: 'm1',
            name: 'mcp__github__issues.list',
            output: { ok: true },
            error: null,
            status: 'completed',
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);

        const reviewStart = converter.handleNotification('item/started', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'rv1', type: 'enteredReviewMode', review: { target: 'uncommitted' } }
        });
        expect(reviewStart).toEqual([{
            type: 'review_mode_entered',
            call_id: 'rv1',
            item_id: 'rv1',
            review: { target: 'uncommitted' },
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);

        const reviewEnd = converter.handleNotification('item/completed', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'rv2', type: 'exitedReviewMode', review: { summary: 'done' } }
        });
        expect(reviewEnd).toEqual([{
            type: 'review_mode_exited',
            call_id: 'rv2',
            item_id: 'rv2',
            review: { summary: 'done' },
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);

        const compact = converter.handleNotification('item/completed', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'ctx-1', type: 'contextCompaction', status: 'completed' }
        });
        expect(compact).toEqual([{
            type: 'context_compaction_completed',
            call_id: 'ctx-1',
            item_id: 'ctx-1',
            status: 'completed',
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);

        const webSearch = converter.handleNotification('item/started', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'ws-1', type: 'webSearch', query: 'hapi', action: { type: 'search' } }
        });
        expect(webSearch).toEqual([{
            type: 'web_search_begin',
            call_id: 'ws-1',
            item_id: 'ws-1',
            name: 'web_search',
            input: { query: 'hapi', action: { type: 'search' } },
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);

        const image = converter.handleNotification('item/completed', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: { id: 'img-1', type: 'imageView', path: '/tmp/a.png', status: 'completed' }
        });
        expect(image).toEqual([{
            type: 'image_view_end',
            call_id: 'img-1',
            item_id: 'img-1',
            name: 'image_view',
            output: null,
            error: null,
            status: 'completed',
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);

        const collab = converter.handleNotification('item/started', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            item: {
                id: 'c1',
                type: 'collabToolCall',
                tool: 'delegate',
                senderThreadId: 't1',
                receiverThreadId: 't2',
                prompt: 'do it'
            }
        });
        expect(collab).toEqual([{
            type: 'collab_tool_call_begin',
            call_id: 'c1',
            item_id: 'c1',
            name: 'delegate',
            input: {
                sender_thread_id: 't1',
                receiver_thread_id: 't2',
                new_thread_id: undefined,
                prompt: 'do it',
                agent_status: undefined
            },
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);
    });

    it('maps structured error fields', () => {
        const converter = new AppServerEventConverter();

        const events = converter.handleNotification('error', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            error: {
                message: 'Upstream failed',
                codexErrorInfo: {
                    kind: 'HttpConnectionFailed',
                    httpStatusCode: 502
                },
                additionalDetails: {
                    upstream: 'openai'
                }
            }
        });

        expect(events).toEqual([{
            type: 'task_failed',
            error: 'Upstream failed',
            codex_error_info: {
                kind: 'HttpConnectionFailed',
                httpStatusCode: 502
            },
            additional_details: {
                upstream: 'openai'
            },
            http_status_code: 502,
            thread_id: 'thread-1',
            turn_id: 'turn-1'
        }]);
    });

    it('maps diff updates', () => {
        const converter = new AppServerEventConverter();

        const events = converter.handleNotification('turn/diff/updated', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            diff: 'diff --git a b'
        });

        expect(events).toEqual([{ type: 'turn_diff', unified_diff: 'diff --git a b', thread_id: 'thread-1', turn_id: 'turn-1' }]);
    });
});
