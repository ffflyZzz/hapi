import React from 'react';
import { randomUUID } from 'node:crypto';

import { CodexMcpClient } from './codexMcpClient';
import { CodexAppServerClient } from './codexAppServerClient';
import { CodexPermissionHandler } from './utils/permissionHandler';
import { ReasoningProcessor } from './utils/reasoningProcessor';
import { DiffProcessor } from './utils/diffProcessor';
import { logger } from '@/ui/logger';
import { CodexDisplay } from '@/ui/ink/CodexDisplay';
import type { CodexSessionConfig } from './types';
import { buildHapiMcpBridge } from './utils/buildHapiMcpBridge';
import { emitReadyIfIdle } from './utils/emitReadyIfIdle';
import type { CodexSession } from './session';
import type { EnhancedMode } from './loop';
import { hasCodexCliOverrides } from './utils/codexCliOverrides';
import { buildCodexStartConfig } from './utils/codexStartConfig';
import { AppServerEventConverter } from './utils/appServerEventConverter';
import { registerAppServerPermissionHandlers } from './utils/appServerPermissionAdapter';
import { buildThreadStartParams, buildTurnStartParams } from './utils/appServerConfig';
import {
    RemoteLauncherBase,
    type RemoteLauncherDisplayContext,
    type RemoteLauncherExitReason
} from '@/modules/common/remote/RemoteLauncherBase';

type HappyServer = Awaited<ReturnType<typeof buildHapiMcpBridge>>['server'];

function shouldUseAppServer(): boolean {
    const useMcpServer = process.env.CODEX_USE_MCP_SERVER === '1';
    return !useMcpServer;
}

class CodexRemoteLauncher extends RemoteLauncherBase {
    private readonly session: CodexSession;
    private readonly useAppServer: boolean;
    private readonly mcpClient: CodexMcpClient | null;
    private readonly appServerClient: CodexAppServerClient | null;
    private permissionHandler: CodexPermissionHandler | null = null;
    private reasoningProcessor: ReasoningProcessor | null = null;
    private diffProcessor: DiffProcessor | null = null;
    private happyServer: HappyServer | null = null;
    private abortController: AbortController = new AbortController();
    private currentThreadId: string | null = null;
    private currentTurnId: string | null = null;

    constructor(session: CodexSession) {
        super(process.env.DEBUG ? session.logPath : undefined);
        this.session = session;
        this.useAppServer = shouldUseAppServer();
        this.mcpClient = this.useAppServer ? null : new CodexMcpClient();
        this.appServerClient = this.useAppServer ? new CodexAppServerClient() : null;
    }

    protected createDisplay(context: RemoteLauncherDisplayContext): React.ReactElement {
        return React.createElement(CodexDisplay, context);
    }

    private async handleAbort(): Promise<void> {
        logger.debug('[Codex] Abort requested - stopping current task');
        try {
            if (this.useAppServer && this.appServerClient) {
                if (this.currentThreadId && this.currentTurnId) {
                    try {
                        await this.appServerClient.interruptTurn({
                            threadId: this.currentThreadId,
                            turnId: this.currentTurnId
                        });
                    } catch (error) {
                        logger.debug('[Codex] Error interrupting app-server turn:', error);
                    }
                }

                this.currentTurnId = null;
            }

            this.abortController.abort();
            this.session.queue.reset();
            this.permissionHandler?.reset();
            this.reasoningProcessor?.abort();
            this.diffProcessor?.reset();
            logger.debug('[Codex] Abort completed - session remains active');
        } catch (error) {
            logger.debug('[Codex] Error during abort:', error);
        } finally {
            this.abortController = new AbortController();
        }
    }

    private async handleExitFromUi(): Promise<void> {
        logger.debug('[codex-remote]: Exiting agent via Ctrl-C');
        this.exitReason = 'exit';
        this.shouldExit = true;
        await this.handleAbort();
    }

    private async handleSwitchFromUi(): Promise<void> {
        logger.debug('[codex-remote]: Switching to local mode via double space');
        this.exitReason = 'switch';
        this.shouldExit = true;
        await this.handleAbort();
    }

    private async handleSwitchRequest(): Promise<void> {
        this.exitReason = 'switch';
        this.shouldExit = true;
        await this.handleAbort();
    }

    public async launch(): Promise<RemoteLauncherExitReason> {
        if (this.session.codexArgs && this.session.codexArgs.length > 0) {
            if (hasCodexCliOverrides(this.session.codexCliOverrides)) {
                logger.debug(`[codex-remote] CLI args include sandbox/approval overrides; other args ` +
                    `are ignored in remote mode.`);
            } else {
                logger.debug(`[codex-remote] Warning: CLI args [${this.session.codexArgs.join(', ')}] are ignored in remote mode. ` +
                    `Remote mode uses message-based configuration (model/sandbox set via web interface).`);
            }
        }

        return this.start({
            onExit: () => this.handleExitFromUi(),
            onSwitchToLocal: () => this.handleSwitchFromUi()
        });
    }

    protected async runMainLoop(): Promise<void> {
        const session = this.session;
        const messageBuffer = this.messageBuffer;
        const useAppServer = this.useAppServer;
        const mcpClient = this.mcpClient;
        const appServerClient = this.appServerClient;
        const appServerEventConverter = useAppServer ? new AppServerEventConverter() : null;

        const normalizeCommand = (value: unknown): string | undefined => {
            if (typeof value === 'string') {
                const trimmed = value.trim();
                return trimmed.length > 0 ? trimmed : undefined;
            }
            if (Array.isArray(value)) {
                const joined = value.filter((part): part is string => typeof part === 'string').join(' ');
                return joined.length > 0 ? joined : undefined;
            }
            return undefined;
        };

        const asRecord = (value: unknown): Record<string, unknown> | null => {
            if (!value || typeof value !== 'object') {
                return null;
            }
            return value as Record<string, unknown>;
        };

        const asString = (value: unknown): string | null => {
            return typeof value === 'string' && value.length > 0 ? value : null;
        };

        const formatOutputPreview = (value: unknown): string => {
            if (typeof value === 'string') return value;
            if (typeof value === 'number' || typeof value === 'boolean') return String(value);
            if (value === null || value === undefined) return '';
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        };

        const permissionHandler = new CodexPermissionHandler(session.client, {
            onRequest: ({ id, toolName, input }) => {
                const inputRecord = input && typeof input === 'object' ? input as Record<string, unknown> : {};
                const message = typeof inputRecord.message === 'string' ? inputRecord.message : undefined;
                const rawCommand = inputRecord.command;
                const command = Array.isArray(rawCommand)
                    ? rawCommand.filter((part): part is string => typeof part === 'string').join(' ')
                    : typeof rawCommand === 'string'
                        ? rawCommand
                        : undefined;
                const cwdValue = inputRecord.cwd;
                const cwd = typeof cwdValue === 'string' && cwdValue.trim().length > 0 ? cwdValue : undefined;

                if (toolName === 'request_user_input' || toolName === 'AskUserQuestion' || toolName === 'ask_user_question') {
                    session.sendCodexMessage({
                        type: 'tool-call',
                        name: toolName,
                        callId: id,
                        input: inputRecord,
                        id: randomUUID()
                    });
                    return;
                }

                session.sendCodexMessage({
                    type: 'tool-call',
                    name: 'CodexPermission',
                    callId: id,
                    input: {
                        tool: toolName,
                        message,
                        command,
                        cwd
                    },
                    id: randomUUID()
                });
            },
            onComplete: ({ id, decision, reason, approved, answers }) => {
                session.sendCodexMessage({
                    type: 'tool-call-result',
                    callId: id,
                    output: {
                        decision,
                        reason,
                        answers
                    },
                    is_error: !approved,
                    id: randomUUID()
                });
            }
        });
        const reasoningProcessor = new ReasoningProcessor((message) => {
            session.sendCodexMessage(message);
        });
        const diffProcessor = new DiffProcessor((message) => {
            session.sendCodexMessage(message);
        });
        this.permissionHandler = permissionHandler;
        this.reasoningProcessor = reasoningProcessor;
        this.diffProcessor = diffProcessor;

        const planCallIdByTurn = new Map<string, string>();

        const toTraceFields = (source: Record<string, unknown>): Record<string, unknown> => {
            const trace: Record<string, unknown> = {};
            const threadId = asString(source.thread_id ?? source.threadId);
            const turnId = asString(source.turn_id ?? source.turnId);
            const itemId = asString(source.item_id ?? source.itemId);
            const status = asString(source.status);
            if (threadId) trace.thread_id = threadId;
            if (turnId) trace.turn_id = turnId;
            if (itemId) trace.item_id = itemId;
            if (status) trace.status = status;
            return trace;
        };

        const stripEnvelopeFields = (source: Record<string, unknown>): Record<string, unknown> => {
            const copy: Record<string, unknown> = { ...source };
            delete copy.type;
            delete copy.call_id;
            delete copy.callId;
            return copy;
        };

        const extractCallId = (source: Record<string, unknown>, prefix: string): string => {
            return asString(source.call_id ?? source.callId ?? source.item_id ?? source.itemId)
                ?? `${prefix}:${randomUUID()}`;
        };

        const emitToolCall = (name: string, callId: string, input: unknown, source: Record<string, unknown>): void => {
            session.sendCodexMessage({
                type: 'tool-call',
                name,
                callId,
                input,
                ...toTraceFields(source),
                id: randomUUID()
            });
        };

        const emitToolResult = (
            callId: string,
            output: unknown,
            source: Record<string, unknown>,
            isError: boolean = false
        ): void => {
            session.sendCodexMessage({
                type: 'tool-call-result',
                callId,
                output,
                is_error: isError,
                ...toTraceFields(source),
                id: randomUUID()
            });
        };

        const handleCodexEvent = (msg: Record<string, unknown>) => {
            const msgType = asString(msg.type);
            if (!msgType) return;

            if (msgType === 'thread_started') {
                const threadId = asString(msg.thread_id ?? msg.threadId);
                if (threadId) {
                    this.currentThreadId = threadId;
                    session.onSessionFound(threadId);
                }
                return;
            }

            if (msgType === 'task_started') {
                const turnId = asString(msg.turn_id ?? msg.turnId);
                if (turnId) {
                    this.currentTurnId = turnId;
                }
            }

            if (msgType === 'task_complete' || msgType === 'turn_aborted' || msgType === 'task_failed') {
                this.currentTurnId = null;
            }

            if (!useAppServer) {
                logger.debug(`[Codex] MCP message: ${JSON.stringify(msg)}`);

                if (msgType === 'event_msg' || msgType === 'response_item' || msgType === 'session_meta') {
                    const payload = asRecord(msg.payload);
                    const payloadType = asString(payload?.type);
                    logger.debug(`[Codex] MCP wrapper event type: ${msgType}${payloadType ? ` (payload=${payloadType})` : ''}`);
                }
            }

            if (msgType === 'agent_message') {
                const message = asString(msg.message);
                if (message) {
                    messageBuffer.addMessage(message, 'assistant');
                }
            } else if (msgType === 'agent_reasoning') {
                const text = asString(msg.text);
                if (text) {
                    messageBuffer.addMessage(`[Thinking] ${text.substring(0, 100)}...`, 'system');
                }
            } else if (msgType === 'exec_command_begin') {
                const command = normalizeCommand(msg.command) ?? 'command';
                messageBuffer.addMessage(`Executing: ${command}`, 'tool');
            } else if (msgType === 'exec_command_end') {
                const output = msg.output ?? msg.error ?? 'Command completed';
                const outputText = formatOutputPreview(output);
                const truncatedOutput = outputText.substring(0, 200);
                messageBuffer.addMessage(
                    `Result: ${truncatedOutput}${outputText.length > 200 ? '...' : ''}`,
                    'result'
                );
            } else if (msgType === 'patch_apply_begin') {
                const changes = asRecord(msg.changes) ?? {};
                const changeCount = Object.keys(changes).length;
                const filesMsg = changeCount === 1 ? '1 file' : `${changeCount} files`;
                messageBuffer.addMessage(`Modifying ${filesMsg}...`, 'tool');
            } else if (msgType === 'patch_apply_end') {
                const stdout = asString(msg.stdout);
                const stderr = asString(msg.stderr);
                const success = Boolean(msg.success);

                if (success) {
                    const message = stdout || 'Files modified successfully';
                    messageBuffer.addMessage(message.substring(0, 200), 'result');
                } else {
                    const errorMsg = stderr || 'Failed to modify files';
                    messageBuffer.addMessage(`Error: ${errorMsg.substring(0, 200)}`, 'result');
                }
            } else if (msgType === 'task_started') {
                messageBuffer.addMessage('Starting task...', 'status');
            } else if (msgType === 'task_complete') {
                messageBuffer.addMessage('Task completed', 'status');
                sendReady();
            } else if (msgType === 'turn_aborted') {
                messageBuffer.addMessage('Turn aborted', 'status');
                sendReady();
            } else if (msgType === 'task_failed') {
                const error = asString(msg.error);
                messageBuffer.addMessage(error ? `Task failed: ${error}` : 'Task failed', 'status');
                sendReady();
            }

            if (msgType === 'task_started') {
                if (useAppServer) {
                    turnInFlight = true;
                }
                if (!session.thinking) {
                    logger.debug('thinking started');
                    session.onThinkingChange(true);
                }
            }
            if (msgType === 'task_complete' || msgType === 'turn_aborted' || msgType === 'task_failed') {
                if (useAppServer) {
                    turnInFlight = false;
                }
                if (session.thinking) {
                    logger.debug('thinking completed');
                    session.onThinkingChange(false);
                }

                const turnId = asString(msg.turn_id ?? msg.turnId);
                if (turnId) {
                    const planCallId = planCallIdByTurn.get(turnId);
                    if (planCallId) {
                        emitToolResult(planCallId, {
                            status: msgType,
                            error: asString(msg.error)
                        }, msg, msgType === 'task_failed');
                        planCallIdByTurn.delete(turnId);
                    }
                }

                diffProcessor.reset();
                appServerEventConverter?.reset();
            }
            if (msgType === 'agent_reasoning_section_break') {
                reasoningProcessor.handleSectionBreak();
            }
            if (msgType === 'agent_reasoning_delta') {
                const delta = asString(msg.delta);
                if (delta) {
                    reasoningProcessor.processDelta(delta);
                }
            }
            if (msgType === 'agent_reasoning') {
                const text = asString(msg.text);
                if (text) {
                    reasoningProcessor.complete(text);
                }
            }
            if (msgType === 'agent_message') {
                const message = asString(msg.message);
                if (message) {
                    session.sendCodexMessage({
                        type: 'message',
                        message,
                        ...toTraceFields(msg),
                        id: randomUUID()
                    });
                }
            }

            if (msgType === 'turn_plan_updated') {
                const turnId = asString(msg.turn_id ?? msg.turnId) ?? randomUUID();
                const callId = `turn-plan:${turnId}`;
                planCallIdByTurn.set(turnId, callId);
                emitToolCall('ExitPlanMode', callId, {
                    explanation: msg.explanation ?? null,
                    plan: msg.plan ?? [],
                    updated_from: 'turn/plan/updated'
                }, msg);
            }

            if (msgType === 'agent_plan_delta') {
                const callId = extractCallId(msg, 'plan-delta');
                const turnId = asString(msg.turn_id ?? msg.turnId);
                if (turnId && !planCallIdByTurn.has(turnId)) {
                    planCallIdByTurn.set(turnId, callId);
                }
                emitToolCall('ExitPlanMode', callId, {
                    plan: msg.plan_text ?? msg.delta ?? '',
                    delta: msg.delta ?? '',
                    updated_from: 'item/plan/delta'
                }, msg);
            }

            if (msgType === 'plan_item_started') {
                const callId = extractCallId(msg, 'plan-item');
                emitToolCall('ExitPlanMode', callId, {
                    plan: msg.text ?? '',
                    updated_from: 'item/started(plan)'
                }, msg);
            }

            if (msgType === 'plan_item_completed') {
                const callId = extractCallId(msg, 'plan-item');
                emitToolResult(callId, {
                    plan: msg.text ?? '',
                    status: msg.status ?? 'completed'
                }, msg);
            }

            if (msgType === 'exec_command_begin' || msgType === 'exec_approval_request') {
                const callId = extractCallId(msg, 'exec');
                emitToolCall('CodexBash', callId, stripEnvelopeFields(msg), msg);
            }

            if (msgType === 'exec_command_end') {
                const callId = extractCallId(msg, 'exec');
                emitToolResult(callId, stripEnvelopeFields(msg), msg, Boolean(msg.error));
            }

            if (msgType === 'token_count') {
                session.sendCodexMessage({
                    ...msg,
                    id: randomUUID()
                });
            }

            if (msgType === 'patch_apply_begin') {
                const callId = extractCallId(msg, 'patch');
                emitToolCall('CodexPatch', callId, stripEnvelopeFields(msg), msg);
            }

            if (msgType === 'patch_apply_delta') {
                const callId = extractCallId(msg, 'patch');
                emitToolResult(callId, {
                    stream: true,
                    delta: msg.delta ?? '',
                    status: msg.status ?? 'in_progress'
                }, msg);
            }

            if (msgType === 'patch_apply_end') {
                const callId = extractCallId(msg, 'patch');
                emitToolResult(callId, stripEnvelopeFields(msg), msg, !Boolean(msg.success));
            }

            if (msgType === 'mcp_tool_call_begin') {
                const callId = extractCallId(msg, 'mcp');
                const toolName = asString(msg.name) ?? 'mcp_tool_call';
                emitToolCall(toolName, callId, msg.input ?? stripEnvelopeFields(msg), msg);
            }

            if (msgType === 'mcp_tool_call_end') {
                const callId = extractCallId(msg, 'mcp');
                emitToolResult(callId, msg.output ?? { error: msg.error ?? null }, msg, Boolean(msg.error));
            }

            if (msgType === 'collab_tool_call_begin') {
                const callId = extractCallId(msg, 'collab');
                const toolName = asString(msg.name) ?? 'collab_tool_call';
                emitToolCall(toolName, callId, msg.input ?? stripEnvelopeFields(msg), msg);
            }

            if (msgType === 'collab_tool_call_end') {
                const callId = extractCallId(msg, 'collab');
                emitToolResult(callId, msg.output ?? { error: msg.error ?? null }, msg, Boolean(msg.error));
            }

            if (msgType === 'web_search_begin') {
                const callId = extractCallId(msg, 'web-search');
                emitToolCall('web_search', callId, msg.input ?? stripEnvelopeFields(msg), msg);
            }

            if (msgType === 'web_search_end') {
                const callId = extractCallId(msg, 'web-search');
                emitToolResult(callId, msg.output ?? { error: msg.error ?? null }, msg, Boolean(msg.error));
            }

            if (msgType === 'image_view_begin') {
                const callId = extractCallId(msg, 'image-view');
                emitToolCall('image_view', callId, msg.input ?? stripEnvelopeFields(msg), msg);
            }

            if (msgType === 'image_view_end') {
                const callId = extractCallId(msg, 'image-view');
                emitToolResult(callId, msg.output ?? { error: msg.error ?? null }, msg, Boolean(msg.error));
            }

            if (msgType === 'review_mode_entered') {
                const callId = extractCallId(msg, 'review');
                emitToolCall('review_mode', callId, { review: msg.review ?? null }, msg);
            }

            if (msgType === 'review_mode_exited') {
                const callId = extractCallId(msg, 'review');
                emitToolResult(callId, { review: msg.review ?? null }, msg);
            }

            if (msgType === 'context_compaction_started') {
                const callId = extractCallId(msg, 'context-compaction');
                emitToolCall('context_compaction', callId, { status: 'started' }, msg);
            }

            if (msgType === 'context_compaction_completed') {
                const callId = extractCallId(msg, 'context-compaction');
                emitToolResult(callId, { status: 'completed' }, msg);
            }

            if (msgType === 'task_failed') {
                session.sendCodexMessage({
                    ...msg,
                    id: randomUUID()
                });
            }

            if (msgType === 'turn_diff') {
                const diff = asString(msg.unified_diff);
                if (diff) {
                    diffProcessor.processDiff(diff);
                }
            }
        };

        if (useAppServer && appServerClient && appServerEventConverter) {
            registerAppServerPermissionHandlers({
                client: appServerClient,
                permissionHandler
            });

            appServerClient.setNotificationHandler((method, params) => {
                const events = appServerEventConverter.handleNotification(method, params);
                for (const event of events) {
                    const eventRecord = asRecord(event) ?? { type: undefined };
                    handleCodexEvent(eventRecord);
                }
            });
        } else if (mcpClient) {
            mcpClient.setPermissionHandler(permissionHandler);
            mcpClient.setHandler((msg) => {
                const eventRecord = asRecord(msg) ?? { type: undefined };
                handleCodexEvent(eventRecord);
            });
        }

        const { server: happyServer, mcpServers } = await buildHapiMcpBridge(session.client);
        this.happyServer = happyServer;

        this.setupAbortHandlers(session.client.rpcHandlerManager, {
            onAbort: () => this.handleAbort(),
            onSwitch: () => this.handleSwitchRequest()
        });

        function logActiveHandles(tag: string) {
            if (!process.env.DEBUG) return;
            const anyProc: any = process as any;
            const handles = typeof anyProc._getActiveHandles === 'function' ? anyProc._getActiveHandles() : [];
            const requests = typeof anyProc._getActiveRequests === 'function' ? anyProc._getActiveRequests() : [];
            logger.debug(`[codex][handles] ${tag}: handles=${handles.length} requests=${requests.length}`);
            try {
                const kinds = handles.map((h: any) => (h && h.constructor ? h.constructor.name : typeof h));
                logger.debug(`[codex][handles] kinds=${JSON.stringify(kinds)}`);
            } catch {}
        }

        function sendReady(): void {
            session.sendSessionEvent({ type: 'ready' });
        }

        const syncSessionId = () => {
            if (!mcpClient) return;
            const clientSessionId = mcpClient.getSessionId();
            if (clientSessionId && clientSessionId !== session.sessionId) {
                session.onSessionFound(clientSessionId);
            }
        };

        if (useAppServer && appServerClient) {
            await appServerClient.connect();
            await appServerClient.initialize({
                clientInfo: {
                    name: 'hapi-codex-client',
                    version: '1.0.0'
                }
            });
        } else if (mcpClient) {
            await mcpClient.connect();
        }

        let wasCreated = false;
        let currentModeHash: string | null = null;
        let pending: { message: string; mode: EnhancedMode; isolate: boolean; hash: string } | null = null;
        let first = true;
        let turnInFlight = false;

        while (!this.shouldExit) {
            logActiveHandles('loop-top');
            let message: { message: string; mode: EnhancedMode; isolate: boolean; hash: string } | null = pending;
            pending = null;
            if (!message) {
                const waitSignal = this.abortController.signal;
                const batch = await session.queue.waitForMessagesAndGetAsString(waitSignal);
                if (!batch) {
                    if (waitSignal.aborted && !this.shouldExit) {
                        logger.debug('[codex]: Wait aborted while idle; ignoring and continuing');
                        continue;
                    }
                    logger.debug(`[codex]: batch=${!!batch}, shouldExit=${this.shouldExit}`);
                    break;
                }
                message = batch;
            }

            if (!message) {
                break;
            }

            if (!useAppServer && wasCreated && currentModeHash && message.hash !== currentModeHash) {
                logger.debug('[Codex] Mode changed – restarting Codex session');
                messageBuffer.addMessage('═'.repeat(40), 'status');
                messageBuffer.addMessage('Starting new Codex session (mode changed)...', 'status');
                mcpClient?.clearSession();
                wasCreated = false;
                currentModeHash = null;
                pending = message;
                permissionHandler.reset();
                reasoningProcessor.abort();
                diffProcessor.reset();
                session.onThinkingChange(false);
                continue;
            }

            messageBuffer.addMessage(message.message, 'user');
            currentModeHash = message.hash;

            try {
                if (!wasCreated) {
                    if (useAppServer && appServerClient) {
                        const threadParams = buildThreadStartParams({
                            mode: message.mode,
                            mcpServers,
                            cliOverrides: session.codexCliOverrides
                        });

                        const resumeCandidate = session.sessionId;
                        let threadId: string | null = null;

                        if (resumeCandidate) {
                            try {
                                const resumeResponse = await appServerClient.resumeThread({
                                    threadId: resumeCandidate,
                                    ...threadParams
                                }, {
                                    signal: this.abortController.signal
                                });
                                const resumeRecord = asRecord(resumeResponse);
                                const resumeThread = resumeRecord ? asRecord(resumeRecord.thread) : null;
                                threadId = asString(resumeThread?.id) ?? resumeCandidate;
                                logger.debug(`[Codex] Resumed app-server thread ${threadId}`);
                            } catch (error) {
                                logger.warn(`[Codex] Failed to resume app-server thread ${resumeCandidate}, starting new thread`, error);
                            }
                        }

                        if (!threadId) {
                            const threadResponse = await appServerClient.startThread(threadParams, {
                                signal: this.abortController.signal
                            });
                            const threadRecord = asRecord(threadResponse);
                            const thread = threadRecord ? asRecord(threadRecord.thread) : null;
                            threadId = asString(thread?.id);
                            if (!threadId) {
                                throw new Error('app-server thread/start did not return thread.id');
                            }
                        }

                        if (!threadId) {
                            throw new Error('app-server resume did not return thread.id');
                        }

                        this.currentThreadId = threadId;
                        session.onSessionFound(threadId);

                        const turnParams = buildTurnStartParams({
                            threadId,
                            message: message.message,
                            mode: message.mode,
                            cliOverrides: session.codexCliOverrides
                        });
                        turnInFlight = true;
                        const turnResponse = await appServerClient.startTurn(turnParams, {
                            signal: this.abortController.signal
                        });
                        const turnRecord = asRecord(turnResponse);
                        const turn = turnRecord ? asRecord(turnRecord.turn) : null;
                        const turnId = asString(turn?.id);
                        if (turnId) {
                            this.currentTurnId = turnId;
                        }
                    } else if (mcpClient) {
                        const startConfig: CodexSessionConfig = buildCodexStartConfig({
                            message: message.message,
                            mode: message.mode,
                            first,
                            mcpServers,
                            cliOverrides: session.codexCliOverrides
                        });

                        await mcpClient.startSession(startConfig, { signal: this.abortController.signal });
                        syncSessionId();
                    }

                    wasCreated = true;
                    first = false;
                } else if (useAppServer && appServerClient) {
                    if (!this.currentThreadId) {
                        logger.debug('[Codex] Missing thread id; restarting app-server thread');
                        wasCreated = false;
                        pending = message;
                        continue;
                    }

                    const turnParams = buildTurnStartParams({
                        threadId: this.currentThreadId,
                        message: message.message,
                        mode: message.mode,
                        cliOverrides: session.codexCliOverrides
                    });
                    turnInFlight = true;
                    const turnResponse = await appServerClient.startTurn(turnParams, {
                        signal: this.abortController.signal
                    });
                    const turnRecord = asRecord(turnResponse);
                    const turn = turnRecord ? asRecord(turnRecord.turn) : null;
                    const turnId = asString(turn?.id);
                    if (turnId) {
                        this.currentTurnId = turnId;
                    }
                } else if (mcpClient) {
                    await mcpClient.continueSession(message.message, { signal: this.abortController.signal });
                    syncSessionId();
                }
            } catch (error) {
                logger.warn('Error in codex session:', error);
                const isAbortError = error instanceof Error && error.name === 'AbortError';
                if (useAppServer) {
                    turnInFlight = false;
                }

                if (isAbortError) {
                    messageBuffer.addMessage('Aborted by user', 'status');
                    session.sendSessionEvent({ type: 'message', message: 'Aborted by user' });
                    if (!useAppServer) {
                        wasCreated = false;
                        currentModeHash = null;
                        logger.debug('[Codex] Marked session as not created after abort for proper resume');
                    }
                } else {
                    messageBuffer.addMessage('Process exited unexpectedly', 'status');
                    session.sendSessionEvent({ type: 'message', message: 'Process exited unexpectedly' });
                    if (useAppServer) {
                        this.currentTurnId = null;
                        this.currentThreadId = null;
                        wasCreated = false;
                    }
                }
            } finally {
                permissionHandler.reset();
                reasoningProcessor.abort();
                diffProcessor.reset();
                appServerEventConverter?.reset();
                session.onThinkingChange(false);
                if (!useAppServer || !turnInFlight) {
                    emitReadyIfIdle({
                        pending,
                        queueSize: () => session.queue.size(),
                        shouldExit: this.shouldExit,
                        sendReady
                    });
                }
                logActiveHandles('after-turn');
            }
        }
    }

    protected async cleanup(): Promise<void> {
        logger.debug('[codex-remote]: cleanup start');
        try {
            if (this.appServerClient) {
                await this.appServerClient.disconnect();
            }
            if (this.mcpClient) {
                await this.mcpClient.disconnect();
            }
        } catch (error) {
            logger.debug('[codex-remote]: Error disconnecting client', error);
        }

        this.clearAbortHandlers(this.session.client.rpcHandlerManager);

        if (this.happyServer) {
            this.happyServer.stop();
            this.happyServer = null;
        }

        this.permissionHandler?.reset();
        this.reasoningProcessor?.abort();
        this.diffProcessor?.reset();
        this.permissionHandler = null;
        this.reasoningProcessor = null;
        this.diffProcessor = null;

        logger.debug('[codex-remote]: cleanup done');
    }
}

export async function codexRemoteLauncher(session: CodexSession): Promise<'switch' | 'exit'> {
    const launcher = new CodexRemoteLauncher(session);
    return launcher.launch();
}
