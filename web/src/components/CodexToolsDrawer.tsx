import { useMemo, useState, type ReactNode } from 'react'
import { isObject } from '@hapi/protocol'
import type { ApiClient } from '@/api/client'
import type { CodexSkill } from '@/types/api'
import { useCodexTools } from '@/hooks/mutations/useCodexTools'
import { useCodexConfig } from '@/hooks/queries/useCodexConfig'
import { useCodexMcpStatus } from '@/hooks/queries/useCodexMcpStatus'
import { useCodexSkills } from '@/hooks/queries/useCodexSkills'
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

function getMcpServerName(entry: Record<string, unknown>): string {
    return asString(entry.name ?? entry.serverName ?? entry.server_id ?? entry.id) ?? 'unknown'
}

function getMcpServerStatus(entry: Record<string, unknown>): string {
    return asString(entry.status ?? entry.health ?? entry.authStatus) ?? 'unknown'
}

function getCollectionCount(value: unknown): number {
    return Array.isArray(value) ? value.length : 0
}

function formatSkillDependencies(skill: CodexSkill): string | null {
    const tools = skill.dependencies?.tools
    if (!Array.isArray(tools) || tools.length === 0) return null
    return tools
        .map((dep) => asString(dep.description ?? dep.value ?? dep.url ?? dep.type))
        .filter((value): value is string => Boolean(value))
        .join(', ')
}

type ParsedCodexBatchEdit = {
    keyPath: string
    value: unknown
    mergeStrategy?: string
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
    const { isOpen, onClose, api, sessionId, sessionName, currentThreadId = null, canCompact } = props
    const [forceReloadSkills, setForceReloadSkills] = useState(false)
    const [configKeyPath, setConfigKeyPath] = useState('apps._default.enabled')
    const [configValueJson, setConfigValueJson] = useState('false')
    const [configMergeStrategy, setConfigMergeStrategy] = useState('replace')
    const [batchEditsJson, setBatchEditsJson] = useState('[\n  {\n    "keyPath": "apps._default.enabled",\n    "value": true,\n    "mergeStrategy": "upsert"\n  }\n]')
    const [configFeedback, setConfigFeedback] = useState<{ tone: 'error' | 'success'; message: string } | null>(null)
    const {
        compactThread,
        reloadMcpConfig,
        unarchiveThread,
        writeConfigValue,
        batchWriteConfig,
        isPending
    } = useCodexTools(api, sessionId)
    const currentThreadQuery = useCodexThread(api, sessionId, { enabled: isOpen })
    const activeThreadsQuery = useCodexThreads(api, sessionId, { archived: false, enabled: isOpen })
    const archivedThreadsQuery = useCodexThreads(api, sessionId, { archived: true, enabled: isOpen })
    const skillsQuery = useCodexSkills(api, sessionId, { enabled: isOpen, forceReload: forceReloadSkills })
    const configQuery = useCodexConfig(api, sessionId, { enabled: isOpen })
    const mcpStatusQuery = useCodexMcpStatus(api, sessionId, { enabled: isOpen })

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
    const mcpEntries = useMemo(
        () => Array.isArray(mcpStatusQuery.data?.data)
            ? mcpStatusQuery.data.data
                .map((entry) => asRecord(entry))
                .filter((entry): entry is Record<string, unknown> => Boolean(entry))
            : [],
        [mcpStatusQuery.data]
    )
    const configText = useMemo(
        () => configQuery.data?.config ? JSON.stringify(configQuery.data.config, null, 2) : null,
        [configQuery.data]
    )
    const configOriginsText = useMemo(
        () => configQuery.data?.origins ? JSON.stringify(configQuery.data.origins, null, 2) : null,
        [configQuery.data]
    )

    const inputClassName = 'w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-text)] outline-none transition focus:border-[var(--app-link)] focus:ring-2 focus:ring-[var(--app-link)]/20'
    const textAreaClassName = `${inputClassName} min-h-[120px] font-mono text-xs`

    const handleWriteConfigValue = async () => {
        setConfigFeedback(null)

        const keyPath = configKeyPath.trim()
        if (!keyPath) {
            setConfigFeedback({
                tone: 'error',
                message: t('session.codexTools.configKeyPathRequired')
            })
            return
        }

        let parsedValue: unknown
        try {
            parsedValue = JSON.parse(configValueJson)
        } catch {
            setConfigFeedback({
                tone: 'error',
                message: t('session.codexTools.configInvalidJson')
            })
            return
        }

        try {
            await writeConfigValue({
                keyPath,
                value: parsedValue,
                mergeStrategy: configMergeStrategy
            })
            setConfigFeedback({
                tone: 'success',
                message: t('session.codexTools.configValueSaved')
            })
        } catch (error) {
            setConfigFeedback({
                tone: 'error',
                message: error instanceof Error ? error.message : t('session.codexTools.configWriteFailed')
            })
        }
    }

    const handleBatchWriteConfig = async () => {
        setConfigFeedback(null)

        let parsedValue: unknown
        try {
            parsedValue = JSON.parse(batchEditsJson)
        } catch {
            setConfigFeedback({
                tone: 'error',
                message: t('session.codexTools.configInvalidBatchJson')
            })
            return
        }

        if (!Array.isArray(parsedValue)) {
            setConfigFeedback({
                tone: 'error',
                message: t('session.codexTools.configInvalidBatchJson')
            })
            return
        }

        const edits: ParsedCodexBatchEdit[] = []
        for (const entry of parsedValue) {
            if (!isObject(entry) || typeof entry.keyPath !== 'string' || entry.keyPath.trim().length === 0) {
                setConfigFeedback({
                    tone: 'error',
                    message: t('session.codexTools.configInvalidBatchShape')
                })
                return
            }

            edits.push({
                keyPath: entry.keyPath.trim(),
                value: entry.value,
                ...(typeof entry.mergeStrategy === 'string' && entry.mergeStrategy.trim().length > 0
                    ? { mergeStrategy: entry.mergeStrategy.trim() }
                    : {})
            })
        }

        try {
            await batchWriteConfig({ edits })
            setConfigFeedback({
                tone: 'success',
                message: t('session.codexTools.configBatchSaved')
            })
        } catch (error) {
            setConfigFeedback({
                tone: 'error',
                message: error instanceof Error ? error.message : t('session.codexTools.configBatchFailed')
            })
        }
    }

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
                        <SectionCard
                            title={t('session.codexTools.currentThread')}
                            actions={(
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void compactThread()}
                                    disabled={!canCompact || isPending}
                                >
                                    {isPending ? t('session.codexTools.compactingThread') : t('session.codexTools.compactThread')}
                                </Button>
                            )}
                        >
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

                        <SectionCard
                            title={t('session.codexTools.skills')}
                            actions={(
                                <Button type="button" size="sm" variant="outline" onClick={() => setForceReloadSkills((value) => !value)}>
                                    {t('session.codexTools.refreshSkills')}
                                </Button>
                            )}
                        >
                            <AsyncState
                                isLoading={skillsQuery.isLoading}
                                error={skillsQuery.error}
                                empty={skillsQuery.entries.length === 0}
                                emptyLabel={t('session.codexTools.noSkills')}
                            >
                                {skillsQuery.entries.map((entry, entryIndex) => (
                                    <div key={`${entry.cwd ?? 'unknown'}-${entryIndex}`} className="space-y-3">
                                        {entry.cwd ? (
                                            <div className="text-xs text-[var(--app-hint)]">{entry.cwd}</div>
                                        ) : null}
                                        {(entry.skills ?? []).map((skill) => (
                                            <div
                                                key={`${entry.cwd ?? 'unknown'}:${skill.name}`}
                                                className="rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-medium">
                                                            {skill.interface?.displayName ?? skill.name}
                                                        </div>
                                                        <div className="mt-1 text-xs text-[var(--app-hint)]">
                                                            {skill.interface?.shortDescription ?? skill.description ?? t('session.codexTools.noSkillDescription')}
                                                        </div>
                                                    </div>
                                                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${skill.enabled === false ? 'bg-amber-500/15 text-amber-500' : 'bg-emerald-500/15 text-emerald-500'}`}>
                                                        {skill.enabled === false ? t('session.codexTools.disabled') : t('session.codexTools.enabled')}
                                                    </span>
                                                </div>
                                                <div className="mt-3 grid gap-2">
                                                    <DataField label={t('session.codexTools.skillScope')} value={skill.scope ?? null} />
                                                    <DataField label={t('session.codexTools.skillPath')} value={skill.path ?? null} />
                                                    <DataField label={t('session.codexTools.skillDependencies')} value={formatSkillDependencies(skill)} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </AsyncState>
                        </SectionCard>

                        <SectionCard
                            title={t('session.codexTools.mcpServers')}
                            actions={(
                                <Button type="button" size="sm" variant="outline" onClick={() => void reloadMcpConfig()} disabled={isPending}>
                                    {isPending ? t('session.codexTools.reloadingMcp') : t('session.codexTools.reloadMcp')}
                                </Button>
                            )}
                        >
                            <AsyncState
                                isLoading={mcpStatusQuery.isLoading}
                                error={mcpStatusQuery.error}
                                empty={mcpEntries.length === 0}
                                emptyLabel={t('session.codexTools.noMcpServers')}
                            >
                                {mcpEntries.map((entry, index) => (
                                    <div key={`${getMcpServerName(entry)}-${index}`} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-medium">{getMcpServerName(entry)}</div>
                                            <span className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">
                                                {getMcpServerStatus(entry)}
                                            </span>
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--app-hint)]">
                                            <div>{t('session.codexTools.mcpTools')}: {getCollectionCount(entry.tools)}</div>
                                            <div>{t('session.codexTools.mcpResources')}: {getCollectionCount(entry.resources)}</div>
                                        </div>
                                    </div>
                                ))}
                            </AsyncState>
                        </SectionCard>

                        <SectionCard title={t('session.codexTools.config')}>
                            <div className="space-y-3">
                                <form
                                    className="space-y-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        void handleWriteConfigValue()
                                    }}
                                >
                                    <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-hint)]">
                                        {t('session.codexTools.writeConfigValue')}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="space-y-1 text-xs text-[var(--app-hint)]">
                                            <span>{t('session.codexTools.configKeyPath')}</span>
                                            <input
                                                aria-label={t('session.codexTools.configKeyPath')}
                                                className={inputClassName}
                                                value={configKeyPath}
                                                onChange={(event) => setConfigKeyPath(event.target.value)}
                                            />
                                        </label>
                                        <label className="space-y-1 text-xs text-[var(--app-hint)]">
                                            <span>{t('session.codexTools.configValueJson')}</span>
                                            <textarea
                                                aria-label={t('session.codexTools.configValueJson')}
                                                className={textAreaClassName}
                                                value={configValueJson}
                                                onChange={(event) => setConfigValueJson(event.target.value)}
                                            />
                                        </label>
                                        <label className="space-y-1 text-xs text-[var(--app-hint)]">
                                            <span>{t('session.codexTools.configMergeStrategy')}</span>
                                            <select
                                                aria-label={t('session.codexTools.configMergeStrategy')}
                                                className={inputClassName}
                                                value={configMergeStrategy}
                                                onChange={(event) => setConfigMergeStrategy(event.target.value)}
                                            >
                                                <option value="replace">replace</option>
                                                <option value="upsert">upsert</option>
                                            </select>
                                        </label>
                                    </div>
                                    <div className="flex justify-end">
                                        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
                                            {t('session.codexTools.writeConfigValue')}
                                        </Button>
                                    </div>
                                </form>

                                <form
                                    className="space-y-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        void handleBatchWriteConfig()
                                    }}
                                >
                                    <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-hint)]">
                                        {t('session.codexTools.applyConfigBatch')}
                                    </div>
                                    <label className="space-y-1 text-xs text-[var(--app-hint)]">
                                        <span>{t('session.codexTools.configBatchJson')}</span>
                                        <textarea
                                            aria-label={t('session.codexTools.configBatchJson')}
                                            className={`${textAreaClassName} min-h-[160px]`}
                                            value={batchEditsJson}
                                            onChange={(event) => setBatchEditsJson(event.target.value)}
                                        />
                                    </label>
                                    <div className="flex justify-end">
                                        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
                                            {t('session.codexTools.applyConfigBatch')}
                                        </Button>
                                    </div>
                                </form>

                                {configFeedback ? (
                                    <div className={`rounded-lg border p-3 text-sm ${
                                        configFeedback.tone === 'error'
                                            ? 'border-red-500/30 bg-red-500/10 text-red-500'
                                            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                                    }`}>
                                        {configFeedback.message}
                                    </div>
                                ) : null}

                                <AsyncState
                                    isLoading={configQuery.isLoading}
                                    error={configQuery.error}
                                    empty={!configText}
                                    emptyLabel={t('session.codexTools.noConfig')}
                                >
                                    <div className="space-y-3">
                                        {configOriginsText ? (
                                            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3">
                                                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--app-hint)]">
                                                    {t('session.codexTools.configOrigins')}
                                                </div>
                                                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-[var(--app-hint)]">
                                                    {configOriginsText}
                                                </pre>
                                            </div>
                                        ) : null}
                                        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3">
                                            <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs">{configText}</pre>
                                        </div>
                                    </div>
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
