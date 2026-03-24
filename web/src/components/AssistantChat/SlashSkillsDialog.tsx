import { useEffect, useMemo, useState } from 'react'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { useTranslation } from '@/lib/use-translation'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'

type SlashSkillsDialogProps = {
    isOpen: boolean
    isLoading: boolean
    error: string | null
    suggestions: Suggestion[]
    onClose: () => void
    onSelect: (suggestion: Suggestion) => void
}

export function SlashSkillsDialog(props: SlashSkillsDialogProps) {
    const { t } = useTranslation()
    const { isOpen, isLoading, error, suggestions, onClose, onSelect } = props
    const [query, setQuery] = useState('')

    useEffect(() => {
        if (isOpen) {
            setQuery('')
        }
    }, [isOpen])

    const filteredSuggestions = useMemo(() => {
        const trimmedQuery = query.trim().toLowerCase()
        if (!trimmedQuery) return suggestions

        return suggestions.filter((suggestion) => {
            const haystacks = [
                suggestion.label,
                suggestion.text,
                suggestion.description ?? ''
            ].map((value) => value.toLowerCase())

            return haystacks.some((value) => value.includes(trimmedQuery))
        })
    }, [query, suggestions])

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('composer.slashSkills.title')}</DialogTitle>
                    <DialogDescription>{t('composer.slashSkills.description')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--app-hint)]" htmlFor="slash-skills-search">
                            {t('composer.slashSkills.searchLabel')}
                        </label>
                        <input
                            id="slash-skills-search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={t('composer.slashSkills.searchPlaceholder')}
                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-text)] outline-none transition focus:border-[var(--app-link)] focus:ring-2 focus:ring-[var(--app-link)]/20"
                        />
                    </div>

                    <div className="max-h-72 space-y-2 overflow-y-auto">
                        {isLoading ? (
                            <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-4 text-sm text-[var(--app-hint)]">
                                {t('composer.slashSkills.loading')}
                            </div>
                        ) : null}

                        {!isLoading && error ? (
                            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-4 text-sm text-red-500">
                                {error}
                            </div>
                        ) : null}

                        {!isLoading && !error && filteredSuggestions.length === 0 ? (
                            <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-4 text-sm text-[var(--app-hint)]">
                                {t('composer.slashSkills.empty')}
                            </div>
                        ) : null}

                        {!isLoading && !error ? filteredSuggestions.map((suggestion) => (
                            <button
                                key={suggestion.key}
                                type="button"
                                className="flex w-full flex-col items-start gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-3 text-left transition hover:border-[var(--app-link)]/40 hover:bg-[var(--app-secondary-bg)]"
                                onClick={() => onSelect(suggestion)}
                            >
                                <span className="font-medium">{suggestion.label}</span>
                                {suggestion.description ? (
                                    <span className="text-sm text-[var(--app-hint)]">{suggestion.description}</span>
                                ) : null}
                            </button>
                        )) : null}
                    </div>

                    <div className="flex justify-end">
                        <Button type="button" variant="secondary" onClick={onClose}>
                            {t('button.cancel')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
