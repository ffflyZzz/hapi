import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useShikiHighlighter } from '@/lib/shiki'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { useTranslation } from '@/lib/use-translation'

export function CodeBlock(props: {
    code: string
    language?: string
    showCopyButton?: boolean
    wrapLongLines?: boolean
}) {
    const { t } = useTranslation()
    const showCopyButton = props.showCopyButton ?? true
    const wrapLongLines = props.wrapLongLines ?? false
    const { copied, copy } = useCopyToClipboard()
    const highlighted = useShikiHighlighter(props.code, props.language)

    return (
        <div className="relative min-w-0 max-w-full">
            {showCopyButton ? (
                <button
                    type="button"
                    onClick={() => copy(props.code)}
                    className="absolute right-1.5 top-1.5 rounded p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] transition-colors"
                    title={t('code.copy')}
                >
                    {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                </button>
            ) : null}

            <div className={`min-w-0 w-full max-w-full rounded-md bg-[var(--app-code-bg)] ${wrapLongLines ? 'overflow-x-hidden overflow-y-hidden' : 'overflow-x-auto overflow-y-hidden'}`}>
                <pre className={`shiki m-0 p-2 pr-8 text-xs font-mono ${wrapLongLines ? 'w-full min-w-0 whitespace-pre-wrap break-words' : 'w-max min-w-full'}`}>
                    <code className={`block ${wrapLongLines ? 'whitespace-pre-wrap break-words' : ''}`}>{highlighted ?? props.code}</code>
                </pre>
            </div>
        </div>
    )
}
