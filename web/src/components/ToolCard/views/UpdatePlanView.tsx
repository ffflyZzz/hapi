import type { ToolViewProps } from '@/components/ToolCard/views/_all'
import { ChecklistList, extractUpdatePlanState, summarizeChecklist } from '@/components/ToolCard/checklist'

function SummaryBadge(props: { label: string; tone: string }) {
    return (
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${props.tone}`}>
            {props.label}
        </span>
    )
}

export function UpdatePlanView(props: ToolViewProps) {
    const { explanation, draft, items } = extractUpdatePlanState(props.block.tool.input, props.block.tool.result)
    const summary = summarizeChecklist(items)

    return (
        <div className="space-y-3">
            {explanation ? (
                <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 text-sm text-[var(--app-hint)]">
                    {explanation}
                </div>
            ) : null}

            {draft ? (
                <div className="rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--app-hint)]">
                        Drafting plan…
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-sm text-[var(--app-hint)]">{draft}</pre>
                </div>
            ) : null}

            {items.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {summary.completed > 0 ? (
                        <SummaryBadge label={`${summary.completed} completed`} tone="bg-emerald-500/15 text-emerald-600" />
                    ) : null}
                    {summary.in_progress > 0 ? (
                        <SummaryBadge label={`${summary.in_progress} in progress`} tone="bg-[var(--app-link)]/15 text-[var(--app-link)]" />
                    ) : null}
                    {summary.pending > 0 ? (
                        <SummaryBadge label={`${summary.pending} pending`} tone="bg-[var(--app-subtle-bg)] text-[var(--app-hint)]" />
                    ) : null}
                </div>
            ) : null}

            <ChecklistList items={items} />
        </div>
    )
}
