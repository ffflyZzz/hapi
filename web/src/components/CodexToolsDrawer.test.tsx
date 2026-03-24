import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { ToastProvider } from '@/lib/toast-context'
import { CodexToolsDrawer } from './CodexToolsDrawer'

const mockUseCodexThread = vi.fn()
const mockUseCodexThreads = vi.fn()
const mockUseCodexTools = vi.fn()

vi.mock('@/hooks/queries/useCodexThread', () => ({
    useCodexThread: (...args: unknown[]) => mockUseCodexThread(...args)
}))

vi.mock('@/hooks/queries/useCodexThreads', () => ({
    useCodexThreads: (...args: unknown[]) => mockUseCodexThreads(...args)
}))

vi.mock('@/hooks/mutations/useCodexTools', () => ({
    useCodexTools: (...args: unknown[]) => mockUseCodexTools(...args)
}))

function renderWithProviders(ui: ReactNode) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false }
        }
    })

    return render(
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <I18nProvider>{ui}</I18nProvider>
            </ToastProvider>
        </QueryClientProvider>
    )
}

describe('CodexToolsDrawer', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        vi.clearAllMocks()

        mockUseCodexThread.mockReturnValue({
            data: {
                thread: {
                    id: 'thread-live',
                    name: 'Current thread',
                    status: 'active',
                    cwd: '/repo'
                }
            },
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })

        mockUseCodexThreads.mockImplementation((_api: unknown, _sessionId: string | null, options?: { archived?: boolean }) => ({
            data: {
                data: options?.archived
                    ? [{ id: 'thread-archived', name: 'Archived notes', status: 'archived' }]
                    : [{ id: 'thread-live', name: 'Current thread', status: 'active' }]
            },
            isLoading: false,
            error: null,
            refetch: vi.fn()
        }))

        mockUseCodexTools.mockReturnValue({
            unarchiveThread: vi.fn(),
            isPending: false
        })
    })

    it('renders thread and history sections for Codex sessions without admin panels', () => {
        renderWithProviders(
            <CodexToolsDrawer
                isOpen
                onClose={vi.fn()}
                api={{} as never}
                sessionId="session-1"
                sessionName="Codex session"
                currentThreadId="thread-live"
                canCompact
            />
        )

        expect(screen.getByRole('heading', { name: 'Codex Tools' })).toBeInTheDocument()
        expect(screen.getByText('Current Thread')).toBeInTheDocument()
        expect(screen.getAllByText('Current thread').length).toBeGreaterThan(0)
        expect(screen.getByText('Thread History')).toBeInTheDocument()
        expect(screen.getByText('Archived notes')).toBeInTheDocument()
        expect(screen.queryByText('Skills')).not.toBeInTheDocument()
        expect(screen.queryByText('Deploy')).not.toBeInTheDocument()
        expect(screen.queryByText('MCP Servers')).not.toBeInTheDocument()
        expect(screen.queryByText('github')).not.toBeInTheDocument()
        expect(screen.queryByText('Config')).not.toBeInTheDocument()
        expect(screen.queryByText(/"model": "gpt-5.4"/)).not.toBeInTheDocument()
    })

    it('shows thread empty states without compact or admin panels', () => {
        mockUseCodexThreads.mockReturnValue({
            data: { data: [] },
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })

        renderWithProviders(
            <CodexToolsDrawer
                isOpen
                onClose={vi.fn()}
                api={{} as never}
                sessionId="session-1"
                sessionName="Codex session"
                currentThreadId="thread-live"
                canCompact={false}
            />
        )

        expect(screen.queryByRole('button', { name: 'Compact Thread' })).not.toBeInTheDocument()
        expect(screen.queryByText('MCP Servers')).not.toBeInTheDocument()
        expect(screen.queryByText('Config')).not.toBeInTheDocument()
        expect(screen.getAllByText('No threads found').length).toBeGreaterThan(0)
    })
})
