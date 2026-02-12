import { logger } from '@/ui/logger';

type ConvertedEvent = {
    type: string;
    [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asText(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value === null || value === undefined) return null;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function extractItemId(params: Record<string, unknown>): string | null {
    const direct = asString(params.itemId ?? params.item_id ?? params.id);
    if (direct) return direct;

    const item = asRecord(params.item);
    if (item) {
        return asString(item.id ?? item.itemId ?? item.item_id);
    }

    return null;
}

function extractItem(params: Record<string, unknown>): Record<string, unknown> | null {
    const item = asRecord(params.item);
    return item ?? params;
}

function normalizeItemType(value: unknown): string | null {
    const raw = asString(value);
    if (!raw) return null;
    return raw.toLowerCase().replace(/[\s_-]/g, '');
}

function extractCommand(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        const parts = value.filter((part): part is string => typeof part === 'string');
        return parts.length > 0 ? parts.join(' ') : null;
    }
    return null;
}

function extractChanges(value: unknown): Record<string, unknown> | null {
    if (Array.isArray(value)) {
        const changes: Record<string, unknown> = {};
        for (const entry of value) {
            const entryRecord = asRecord(entry);
            if (!entryRecord) continue;
            const path = asString(entryRecord.path ?? entryRecord.file ?? entryRecord.filePath ?? entryRecord.file_path);
            if (path) {
                changes[path] = entryRecord;
            }
        }
        return Object.keys(changes).length > 0 ? changes : null;
    }

    const record = asRecord(value);
    if (record) return record;

    return null;
}

function extractThreadId(params: Record<string, unknown>, item?: Record<string, unknown> | null): string | null {
    const thread = asRecord(params.thread);
    const turn = asRecord(params.turn);
    const itemThread = item ? asRecord(item.thread) : null;
    const turnThread = turn ? asRecord(turn.thread) : null;

    const candidates = [
        params.threadId,
        params.thread_id,
        thread?.id,
        thread?.threadId,
        thread?.thread_id,
        params.sid,
        turn?.threadId,
        turn?.thread_id,
        turnThread?.id,
        item?.threadId,
        item?.thread_id,
        itemThread?.id
    ];

    for (const candidate of candidates) {
        const value = asString(candidate);
        if (value) return value;
    }

    return null;
}

function extractTurnId(params: Record<string, unknown>, item?: Record<string, unknown> | null): string | null {
    const turn = asRecord(params.turn);
    const itemTurn = item ? asRecord(item.turn) : null;

    const candidates = [
        params.turnId,
        params.turn_id,
        turn?.id,
        turn?.turnId,
        turn?.turn_id,
        item?.turnId,
        item?.turn_id,
        itemTurn?.id
    ];

    for (const candidate of candidates) {
        const value = asString(candidate);
        if (value) return value;
    }

    return null;
}

function pickStatus(params: Record<string, unknown>, item?: Record<string, unknown> | null): string | null {
    return asString(params.status ?? item?.status);
}

function addStableFields(
    target: ConvertedEvent,
    params: Record<string, unknown>,
    item?: Record<string, unknown> | null,
    itemId?: string | null
): ConvertedEvent {
    const threadId = extractThreadId(params, item);
    const turnId = extractTurnId(params, item);
    const status = pickStatus(params, item);

    if (threadId) target.thread_id = threadId;
    if (turnId) target.turn_id = turnId;
    if (itemId) target.item_id = itemId;
    if (status) target.status = status;

    return target;
}

export class AppServerEventConverter {
    private readonly agentMessageBuffers = new Map<string, string>();
    private readonly reasoningBuffers = new Map<string, string>();
    private readonly planBuffers = new Map<string, string>();
    private readonly commandOutputBuffers = new Map<string, string>();
    private readonly fileChangeOutputBuffers = new Map<string, string>();
    private readonly commandMeta = new Map<string, Record<string, unknown>>();
    private readonly fileChangeMeta = new Map<string, Record<string, unknown>>();

    handleNotification(method: string, params: unknown): ConvertedEvent[] {
        const events: ConvertedEvent[] = [];
        const paramsRecord = asRecord(params) ?? {};

        if (method === 'thread/started' || method === 'thread/resumed') {
            const thread = asRecord(paramsRecord.thread) ?? paramsRecord;
            const threadId = asString(thread.threadId ?? thread.thread_id ?? thread.id);
            if (threadId) {
                events.push({ type: 'thread_started', thread_id: threadId });
            }
            return events;
        }

        if (method === 'turn/started') {
            const turn = asRecord(paramsRecord.turn) ?? paramsRecord;
            const turnId = asString(turn.turnId ?? turn.turn_id ?? turn.id);
            events.push(addStableFields({ type: 'task_started', ...(turnId ? { turn_id: turnId } : {}) }, paramsRecord));
            return events;
        }

        if (method === 'turn/completed') {
            const turn = asRecord(paramsRecord.turn) ?? paramsRecord;
            const statusRaw = asString(paramsRecord.status ?? turn.status);
            const status = statusRaw?.toLowerCase();
            const turnId = asString(turn.turnId ?? turn.turn_id ?? turn.id);
            const errorMessage = asString(paramsRecord.error ?? paramsRecord.message ?? paramsRecord.reason);

            if (status === 'interrupted' || status === 'cancelled' || status === 'canceled') {
                events.push(addStableFields({ type: 'turn_aborted', ...(turnId ? { turn_id: turnId } : {}) }, paramsRecord));
                return events;
            }

            if (status === 'failed' || status === 'error') {
                events.push(addStableFields({
                    type: 'task_failed',
                    ...(turnId ? { turn_id: turnId } : {}),
                    ...(errorMessage ? { error: errorMessage } : {})
                }, paramsRecord));
                return events;
            }

            events.push(addStableFields({ type: 'task_complete', ...(turnId ? { turn_id: turnId } : {}) }, paramsRecord));
            return events;
        }

        if (method === 'turn/diff/updated') {
            const diff = asString(paramsRecord.diff ?? paramsRecord.unified_diff ?? paramsRecord.unifiedDiff);
            if (diff) {
                events.push(addStableFields({ type: 'turn_diff', unified_diff: diff }, paramsRecord));
            }
            return events;
        }

        if (method === 'turn/plan/updated') {
            const explanation = asString(paramsRecord.explanation);
            const plan = Array.isArray(paramsRecord.plan) ? paramsRecord.plan : null;
            events.push(addStableFields({
                type: 'turn_plan_updated',
                ...(explanation ? { explanation } : {}),
                ...(plan ? { plan } : {})
            }, paramsRecord));
            return events;
        }

        if (method === 'thread/tokenUsage/updated') {
            const info = asRecord(paramsRecord.tokenUsage ?? paramsRecord.token_usage ?? paramsRecord) ?? {};
            events.push(addStableFields({ type: 'token_count', info }, paramsRecord));
            return events;
        }

        if (method === 'error') {
            const willRetry = asBoolean(paramsRecord.will_retry ?? paramsRecord.willRetry) ?? false;
            if (willRetry) return events;

            const errorRecord = asRecord(paramsRecord.error);
            const codexErrorInfo = asRecord(
                paramsRecord.codexErrorInfo
                ?? paramsRecord.codex_error_info
                ?? errorRecord?.codexErrorInfo
                ?? errorRecord?.codex_error_info
            );
            const additionalDetails = asRecord(
                paramsRecord.additionalDetails
                ?? paramsRecord.additional_details
                ?? errorRecord?.additionalDetails
                ?? errorRecord?.additional_details
            );
            const httpStatusCode = asNumber(
                codexErrorInfo?.httpStatusCode
                ?? codexErrorInfo?.http_status_code
                ?? paramsRecord.httpStatusCode
                ?? paramsRecord.http_status_code
            );
            const message = asString(paramsRecord.message)
                ?? asString(errorRecord?.message)
                ?? asString(paramsRecord.reason)
                ?? 'Unknown app-server error';

            events.push(addStableFields({
                type: 'task_failed',
                error: message,
                ...(codexErrorInfo ? { codex_error_info: codexErrorInfo } : {}),
                ...(additionalDetails ? { additional_details: additionalDetails } : {}),
                ...(httpStatusCode !== null ? { http_status_code: httpStatusCode } : {})
            }, paramsRecord));
            return events;
        }

        if (method === 'item/agentMessage/delta') {
            const itemId = extractItemId(paramsRecord);
            const delta = asString(paramsRecord.delta ?? paramsRecord.text ?? paramsRecord.message);
            if (itemId && delta) {
                const prev = this.agentMessageBuffers.get(itemId) ?? '';
                this.agentMessageBuffers.set(itemId, prev + delta);
            }
            return events;
        }

        if (method === 'item/plan/delta') {
            const itemId = extractItemId(paramsRecord);
            const delta = asString(paramsRecord.delta ?? paramsRecord.text ?? paramsRecord.message);
            if (itemId && delta) {
                const prev = this.planBuffers.get(itemId) ?? '';
                const next = prev + delta;
                this.planBuffers.set(itemId, next);
                events.push(addStableFields({
                    type: 'agent_plan_delta',
                    item_id: itemId,
                    delta,
                    plan_text: next
                }, paramsRecord, undefined, itemId));
            }
            return events;
        }

        if (method === 'item/reasoning/summaryTextDelta' || method === 'item/reasoning/textDelta') {
            const itemId = extractItemId(paramsRecord) ?? 'reasoning';
            const delta = asString(paramsRecord.delta ?? paramsRecord.text ?? paramsRecord.message);
            if (delta) {
                const prev = this.reasoningBuffers.get(itemId) ?? '';
                this.reasoningBuffers.set(itemId, prev + delta);
                events.push(addStableFields({
                    type: 'agent_reasoning_delta',
                    delta,
                    item_id: itemId,
                    ...(method === 'item/reasoning/summaryTextDelta' ? { reasoning_stream: 'summary' } : { reasoning_stream: 'raw' }),
                    ...(asNumber(paramsRecord.summaryIndex ?? paramsRecord.summary_index) !== null
                        ? { summary_index: asNumber(paramsRecord.summaryIndex ?? paramsRecord.summary_index) }
                        : {})
                }, paramsRecord, undefined, itemId));
            }
            return events;
        }

        if (method === 'item/reasoning/summaryPartAdded') {
            events.push(addStableFields({ type: 'agent_reasoning_section_break' }, paramsRecord));
            return events;
        }

        if (method === 'item/commandExecution/outputDelta') {
            const itemId = extractItemId(paramsRecord);
            const delta = asText(paramsRecord.delta ?? paramsRecord.text ?? paramsRecord.output ?? paramsRecord.stdout);
            if (itemId && delta) {
                const prev = this.commandOutputBuffers.get(itemId) ?? '';
                this.commandOutputBuffers.set(itemId, prev + delta);
            }
            return events;
        }

        if (method === 'item/fileChange/outputDelta') {
            const itemId = extractItemId(paramsRecord);
            const delta = asText(paramsRecord.delta ?? paramsRecord.text ?? paramsRecord.output ?? paramsRecord.stdout ?? paramsRecord.response);
            if (itemId && delta) {
                const prev = this.fileChangeOutputBuffers.get(itemId) ?? '';
                this.fileChangeOutputBuffers.set(itemId, prev + delta);
                events.push(addStableFields({
                    type: 'patch_apply_delta',
                    item_id: itemId,
                    delta
                }, paramsRecord, undefined, itemId));
            }
            return events;
        }

        if (method === 'item/started' || method === 'item/completed') {
            const item = extractItem(paramsRecord);
            if (!item) return events;

            const itemType = normalizeItemType(item.type ?? item.itemType ?? item.kind);
            const itemId = extractItemId(paramsRecord) ?? asString(item.id ?? item.itemId ?? item.item_id);
            const status = asString(item.status);
            const threadId = extractThreadId(paramsRecord, item);
            const turnId = extractTurnId(paramsRecord, item);

            if (!itemType || !itemId) {
                return events;
            }

            if (itemType === 'agentmessage') {
                if (method === 'item/completed') {
                    const text = asString(item.text ?? item.message ?? item.content) ?? this.agentMessageBuffers.get(itemId);
                    if (text) {
                        const event = addStableFields({
                            type: 'agent_message',
                            message: text,
                            item_id: itemId,
                            ...(status ? { status } : {})
                        }, paramsRecord, item, itemId);
                        events.push(event);
                    }
                    this.agentMessageBuffers.delete(itemId);
                }
                return events;
            }

            if (itemType === 'reasoning') {
                if (method === 'item/completed') {
                    const text = asString(item.text ?? item.message ?? item.content) ?? this.reasoningBuffers.get(itemId);
                    if (text) {
                        const event = addStableFields({
                            type: 'agent_reasoning',
                            text,
                            item_id: itemId,
                            ...(status ? { status } : {})
                        }, paramsRecord, item, itemId);
                        events.push(event);
                    }
                    this.reasoningBuffers.delete(itemId);
                }
                return events;
            }

            if (itemType === 'plan') {
                if (method === 'item/started') {
                    const text = asString(item.text ?? item.message ?? item.content);
                    if (text) {
                        this.planBuffers.set(itemId, text);
                    }
                    events.push(addStableFields({
                        type: 'plan_item_started',
                        call_id: itemId,
                        item_id: itemId,
                        ...(text ? { text } : {}),
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));
                }

                if (method === 'item/completed') {
                    const text = asString(item.text ?? item.message ?? item.content) ?? this.planBuffers.get(itemId);
                    events.push(addStableFields({
                        type: 'plan_item_completed',
                        call_id: itemId,
                        item_id: itemId,
                        ...(text ? { text } : {}),
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));
                    this.planBuffers.delete(itemId);
                }

                return events;
            }

            if (itemType === 'commandexecution') {
                if (method === 'item/started') {
                    const command = extractCommand(item.command ?? item.cmd ?? item.args);
                    const cwd = asString(item.cwd ?? item.workingDirectory ?? item.working_directory);
                    const autoApproved = asBoolean(item.autoApproved ?? item.auto_approved);
                    const meta: Record<string, unknown> = {};
                    if (command) meta.command = command;
                    if (cwd) meta.cwd = cwd;
                    if (autoApproved !== null) meta.auto_approved = autoApproved;
                    if (threadId) meta.thread_id = threadId;
                    if (turnId) meta.turn_id = turnId;
                    this.commandMeta.set(itemId, meta);

                    events.push(addStableFields({
                        type: 'exec_command_begin',
                        call_id: itemId,
                        item_id: itemId,
                        ...meta,
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));
                }

                if (method === 'item/completed') {
                    const meta = this.commandMeta.get(itemId) ?? {};
                    const output = asText(item.output ?? item.result ?? item.stdout) ?? this.commandOutputBuffers.get(itemId);
                    const stderr = asText(item.stderr);
                    const error = asText(item.error);
                    const exitCode = asNumber(item.exitCode ?? item.exit_code ?? item.exitcode);

                    events.push(addStableFields({
                        type: 'exec_command_end',
                        call_id: itemId,
                        item_id: itemId,
                        ...meta,
                        ...(output ? { output } : {}),
                        ...(stderr ? { stderr } : {}),
                        ...(error ? { error } : {}),
                        ...(exitCode !== null ? { exit_code: exitCode } : {}),
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));

                    this.commandMeta.delete(itemId);
                    this.commandOutputBuffers.delete(itemId);
                }

                return events;
            }

            if (itemType === 'filechange') {
                if (method === 'item/started') {
                    const changes = extractChanges(item.changes ?? item.change ?? item.diff);
                    const autoApproved = asBoolean(item.autoApproved ?? item.auto_approved);
                    const meta: Record<string, unknown> = {};
                    if (changes) meta.changes = changes;
                    if (autoApproved !== null) meta.auto_approved = autoApproved;
                    if (threadId) meta.thread_id = threadId;
                    if (turnId) meta.turn_id = turnId;
                    this.fileChangeMeta.set(itemId, meta);

                    events.push(addStableFields({
                        type: 'patch_apply_begin',
                        call_id: itemId,
                        item_id: itemId,
                        ...meta,
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));
                }

                if (method === 'item/completed') {
                    const meta = this.fileChangeMeta.get(itemId) ?? {};
                    const stdout = asText(item.stdout ?? item.output) ?? this.fileChangeOutputBuffers.get(itemId) ?? undefined;
                    const stderr = asText(item.stderr);
                    const success = asBoolean(item.success ?? item.ok ?? item.applied ?? item.status === 'completed');

                    events.push(addStableFields({
                        type: 'patch_apply_end',
                        call_id: itemId,
                        item_id: itemId,
                        ...meta,
                        ...(stdout ? { stdout } : {}),
                        ...(stderr ? { stderr } : {}),
                        success: success ?? false,
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));

                    this.fileChangeMeta.delete(itemId);
                    this.fileChangeOutputBuffers.delete(itemId);
                }

                return events;
            }

            if (itemType === 'mcptoolcall') {
                const server = asString(item.server);
                const tool = asString(item.tool);
                const name = server && tool ? `mcp__${server}__${tool}` : (tool ?? 'mcp_tool_call');
                if (method === 'item/started') {
                    events.push(addStableFields({
                        type: 'mcp_tool_call_begin',
                        call_id: itemId,
                        item_id: itemId,
                        name,
                        input: item.arguments ?? item.input ?? null,
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));
                } else {
                    events.push(addStableFields({
                        type: 'mcp_tool_call_end',
                        call_id: itemId,
                        item_id: itemId,
                        name,
                        output: item.result ?? item.output ?? null,
                        error: item.error ?? null,
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));
                }
                return events;
            }

            if (itemType === 'collabtoolcall') {
                const tool = asString(item.tool) ?? 'collab_tool_call';
                if (method === 'item/started') {
                    events.push(addStableFields({
                        type: 'collab_tool_call_begin',
                        call_id: itemId,
                        item_id: itemId,
                        name: tool,
                        input: {
                            sender_thread_id: item.senderThreadId ?? item.sender_thread_id,
                            receiver_thread_id: item.receiverThreadId ?? item.receiver_thread_id,
                            new_thread_id: item.newThreadId ?? item.new_thread_id,
                            prompt: item.prompt,
                            agent_status: item.agentStatus ?? item.agent_status
                        },
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));
                } else {
                    events.push(addStableFields({
                        type: 'collab_tool_call_end',
                        call_id: itemId,
                        item_id: itemId,
                        name: tool,
                        output: item.result ?? item.output ?? null,
                        error: item.error ?? null,
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));
                }
                return events;
            }

            if (itemType === 'websearch') {
                if (method === 'item/started') {
                    events.push(addStableFields({
                        type: 'web_search_begin',
                        call_id: itemId,
                        item_id: itemId,
                        name: 'web_search',
                        input: {
                            query: item.query,
                            action: item.action ?? null
                        },
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));
                } else {
                    events.push(addStableFields({
                        type: 'web_search_end',
                        call_id: itemId,
                        item_id: itemId,
                        name: 'web_search',
                        output: item.result ?? item.output ?? null,
                        error: item.error ?? null,
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));
                }
                return events;
            }

            if (itemType === 'imageview') {
                if (method === 'item/started') {
                    events.push(addStableFields({
                        type: 'image_view_begin',
                        call_id: itemId,
                        item_id: itemId,
                        name: 'image_view',
                        input: {
                            path: asString(item.path)
                        },
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));
                } else {
                    events.push(addStableFields({
                        type: 'image_view_end',
                        call_id: itemId,
                        item_id: itemId,
                        name: 'image_view',
                        output: item.result ?? item.output ?? null,
                        error: item.error ?? null,
                        ...(status ? { status } : {})
                    }, paramsRecord, item, itemId));
                }
                return events;
            }

            if (itemType === 'enteredreviewmode') {
                events.push(addStableFields({
                    type: 'review_mode_entered',
                    call_id: itemId,
                    item_id: itemId,
                    review: item.review ?? null,
                    ...(status ? { status } : {})
                }, paramsRecord, item, itemId));
                return events;
            }

            if (itemType === 'exitedreviewmode') {
                events.push(addStableFields({
                    type: 'review_mode_exited',
                    call_id: itemId,
                    item_id: itemId,
                    review: item.review ?? null,
                    ...(status ? { status } : {})
                }, paramsRecord, item, itemId));
                return events;
            }

            if (itemType === 'contextcompaction') {
                events.push(addStableFields({
                    type: method === 'item/started' ? 'context_compaction_started' : 'context_compaction_completed',
                    call_id: itemId,
                    item_id: itemId,
                    ...(status ? { status } : {})
                }, paramsRecord, item, itemId));
                return events;
            }
        }

        logger.debug('[AppServerEventConverter] Unhandled notification', { method, params });
        return events;
    }

    reset(): void {
        this.agentMessageBuffers.clear();
        this.reasoningBuffers.clear();
        this.planBuffers.clear();
        this.commandOutputBuffers.clear();
        this.fileChangeOutputBuffers.clear();
        this.commandMeta.clear();
        this.fileChangeMeta.clear();
    }
}
