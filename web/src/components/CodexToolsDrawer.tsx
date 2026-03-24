import { useMemo, type ReactNode } from 'react'
import { isObject } from '@hapi/protocol'
import type { ApiClient } from '@/api/client'
import { useCodexTools } from '@/hooks/mutations/useCodexTools'
import { useCodexThread } from '@/hooks/queries/useCodexThread'
import { useCodexThreads } from '@/hooks/queries/useCodexThreads'
import { useTranslation } from '@/lib/use-translation'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'

type CodexToolsDrawerProps = {
    isOpen: boolean
    onClose: () => void
    api: ApiClient | null
    sessionId: string
    sessionName: string
    currentThreadId?: string | null
    canCompact: boolean
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return isObject(value) ? value : null
}

function getThreadId(thread: Record<string, unknown> | null): string | null {
    if (!thread) return null
    return asString(thread.id ?? thread.threadId ?? thread.thread_id)
}

function getThreadName(thread: Record<string, unknown> | null): string | null {
    if (!thread) return null
    return asString(thread.name ?? thread.title)
}

function getThreadStatus(thread: Record<string, unknown> | null): string | null {
    if (!thread) return null
    return asString(thread.status ?? thread.state)
}

function getThreadCwd(thread: Record<string, unknown> | null): string | null {
    if (!thread) return null
    return asString(thread.cwd ?? thread.path)
}

function SectionCard(props: { title: string; actions?: ReactNode; children: ReactNode }) {
    return (
        <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{props.title}</h3>
                {props.actions}
            </div>
            <div className="space-y-3">{props.children}</div>
        </section>
    )
}

function DataField(props: { label: string; value: string | null }) {
    if (!props.value) return null
    return (
        <div className="space-y-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-hint)]">
                {props.label}
            </div>
            <div className="break-all text-sm">{props.value}</div>
        </div>
    )
}

function AsyncState(props: {
    isLoading: boolean
    error: string | null
    empty: boolean
    emptyLabel: string
    children: ReactNode
}) {
    const { t } = useTranslation()
    if (props.isLoading) {
        return <div className="text-sm text-[var(--app-hint)]">{t('loading')}</div>
    }
    if (props.error) {
        return <div className="text-sm text-red-500">{props.error}</div>
    }
    if (props.empty) {
        return <div className="text-sm text-[var(--app-hint)]">{props.emptyLabel}</div>
    }
    return <>{props.children}</>
}

function ThreadRow(props: {
    thread: Record<string, unknown>
    currentThreadId?: string | null
    archived?: boolean
    onRestore?: () => Promise<void>
    pending?: boolean
}) {
    const { t } = useTranslation()
    const threadId = getThreadId(props.thread)
    const threadName = getThreadName(props.thread) ?? threadId ?? t('session.codexTools.unnamedThread')
    const status = getThreadStatus(props.thread)
    const canRestore = Boolean(props.archived && props.onRestore && threadId && props.currentThreadId === threadId)

    return (
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{threadName}</div>
                    {threadId ? (
                        <div className="mt-1 break-all text-xs text-[var(--app-hint)]">{threadId}</div>
                    ) : null}
                </div>
                {canRestore ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => void props.onRestore?.()} disabled={props.pending}>
                        {t('session.action.restoreThread')}
                    </Button>
                ) : null}
            </div>
            {status ? (
                <div className="mt-2 text-xs text-[var(--app-hint)]">
                    {t('session.codexTools.threadStatus')}: {status}
                </div>
            ) : null}
        </div>
    )
}

export function CodexToolsDrawer(props: CodexToolsDrawerProps) {
    const { t } = useTranslation()
    const { isOpen, onClose, api, sessionId, sessionName, currentThreadId = null } = props
    const { unarchiveThread, isPending } = useCodexTools(api, sessionId)
    const currentThreadQuery = useCodexThread(api, sessionId, { enabled: isOpen })
    const activeThreadsQuery = useCodexThreads(api, sessionId, { archived: false, enabled: isOpen })
    const archivedThreadsQuery = useCodexThreads(api, sessionId, { archived: true, enabled: isOpen })

    const currentThread = useMemo(() => asRecord(currentThreadQuery.data?.thread), [currentThreadQuery.data])
    const activeThreads = useMemo(
        () => Array.isArray(activeThreadsQuery.data?.data)
            ? activeThreadsQuery.data.data
                .map((thread) => asRecord(thread))
                .filter((thread): thread is Record<string, unknown> => Boolean(thread))
            : [],
        [activeThreadsQuery.data]
    )
    const archivedThreads = useMemo(
        () => Array.isArray(archivedThreadsQuery.data?.data)
            ? archivedThreadsQuery.data.data
                .map((thread) => asRecord(thread))
                .filter((thread): thread is Record<string, unknown> => Boolean(thread))
            : [],
        [archivedThreadsQuery.data]
    )

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="left-auto right-0 top-0 h-screen w-full max-w-[min(900px,100vw)] translate-x-0 translate-y-0 rounded-none border-l border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-0">
                <div className="flex h-full flex-col">
                    <DialogHeader className="border-b border-[var(--app-border)] px-5 py-4">
                        <DialogTitle>{t('session.codexTools.title')}</DialogTitle>
                        <DialogDescription>
                            {t('session.codexTools.description', { name: sessionName })}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2">
                        <SectionCard title={t('session.codexTools.currentThread')}>
                            <AsyncState
                                isLoading={currentThreadQuery.isLoading}
                                error={currentThreadQuery.error}
                                empty={!currentThread}
                                emptyLabel={t('session.codexTools.currentThreadUnavailable')}
                            >
                                <DataField label={t('session.codexTools.threadName')} value={getThreadName(currentThread) ?? currentThreadId} />
                                <DataField label={t('session.codexTools.threadId')} value={getThreadId(currentThread) ?? currentThreadId} />
                                <DataField label={t('session.codexTools.threadStatus')} value={getThreadStatus(currentThread)} />
                                <DataField label={t('session.codexTools.threadCwd')} value={getThreadCwd(currentThread)} />
                            </AsyncState>
                        </SectionCard>

                        <SectionCard title={t('session.codexTools.threadHistory')}>
                            <div className="space-y-2">
                                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-hint)]">
                                    {t('session.codexTools.activeThreads')}
                                </div>
                                <AsyncState
                                    isLoading={activeThreadsQuery.isLoading}
                                    error={activeThreadsQuery.error}
                                    empty={activeThreads.length === 0}
                                    emptyLabel={t('session.codexTools.noThreads')}
                                >
                                    {activeThreads.map((thread) => (
                                        <ThreadRow key={getThreadId(thread) ?? JSON.stringify(thread)} thread={thread} currentThreadId={currentThreadId} />
                                    ))}
                                </AsyncState>
                            </div>
                            <div className="space-y-2 pt-2">
                                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-hint)]">
                                    {t('session.codexTools.archivedThreads')}
                                </div>
                                <AsyncState
                                    isLoading={archivedThreadsQuery.isLoading}
                                    error={archivedThreadsQuery.error}
                                    empty={archivedThreads.length === 0}
                                    emptyLabel={t('session.codexTools.noThreads')}
                                >
                                    {archivedThreads.map((thread) => (
                                        <ThreadRow
                                            key={getThreadId(thread) ?? JSON.stringify(thread)}
                                            thread={thread}
                                            currentThreadId={currentThreadId}
                                            archived
                                            onRestore={unarchiveThread}
                                            pending={isPending}
                                        />
                                    ))}
                                </AsyncState>
                            </div>
                        </SectionCard>
                    </div>

                    <div className="border-t border-[var(--app-border)] px-5 py-4">
                        <div className="flex justify-end">
                            <Button type="button" variant="secondary" onClick={onClose}>
                                {t('button.close')}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
