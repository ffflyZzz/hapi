import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { SessionActionMenu } from './SessionActionMenu'

function renderWithProviders(ui: React.ReactElement) {
    return render(
        <I18nProvider>
            {ui}
        </I18nProvider>
    )
}

describe('SessionActionMenu', () => {
    it('shows Codex tools and archive thread for active remote Codex sessions', () => {
        const view = renderWithProviders(
            <SessionActionMenu
                isOpen
                onClose={vi.fn()}
                sessionActive
                isCodexSession
                isCodexRemote
                isCodexArchived={false}
                onRename={vi.fn()}
                onArchive={vi.fn()}
                onDelete={vi.fn()}
                onRestore={vi.fn()}
                onOpenCodexTools={vi.fn()}
                anchorPoint={{ x: 20, y: 20 }}
            />
        )

        const menu = within(view.container)
        expect(menu.getByRole('menuitem', { name: 'Codex Tools' })).toBeInTheDocument()
        expect(menu.getByRole('menuitem', { name: 'Archive Thread' })).toBeInTheDocument()
        expect(menu.queryByRole('menuitem', { name: 'Restore Thread' })).not.toBeInTheDocument()
        expect(menu.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()
    })

    it('shows restore plus delete for inactive archived Codex sessions', () => {
        const view = renderWithProviders(
            <SessionActionMenu
                isOpen
                onClose={vi.fn()}
                sessionActive={false}
                isCodexSession
                isCodexRemote
                isCodexArchived
                onRename={vi.fn()}
                onArchive={vi.fn()}
                onDelete={vi.fn()}
                onRestore={vi.fn()}
                onOpenCodexTools={vi.fn()}
                anchorPoint={{ x: 20, y: 20 }}
            />
        )

        const menu = within(view.container)
        expect(menu.getByRole('menuitem', { name: 'Codex Tools' })).toBeInTheDocument()
        expect(menu.getByRole('menuitem', { name: 'Restore Thread' })).toBeInTheDocument()
        expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
        expect(menu.queryByRole('menuitem', { name: 'Archive Thread' })).not.toBeInTheDocument()
    })
})
