import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { ToastProvider } from '@/lib/toast-context'
import { CodexToolsDrawer } from './CodexToolsDrawer'

const mockUseCodexThread = vi.fn()
const mockUseCodexThreads = vi.fn()
const mockUseCodexSkills = vi.fn()
const mockUseCodexConfig = vi.fn()
const mockUseCodexMcpStatus = vi.fn()
const mockUseCodexTools = vi.fn()
const writeConfigValueMock = vi.fn()
const batchWriteConfigMock = vi.fn()

vi.mock('@/hooks/queries/useCodexThread', () => ({
    useCodexThread: (...args: unknown[]) => mockUseCodexThread(...args)
}))

vi.mock('@/hooks/queries/useCodexThreads', () => ({
    useCodexThreads: (...args: unknown[]) => mockUseCodexThreads(...args)
}))

vi.mock('@/hooks/queries/useCodexSkills', () => ({
    useCodexSkills: (...args: unknown[]) => mockUseCodexSkills(...args)
}))

vi.mock('@/hooks/queries/useCodexConfig', () => ({
    useCodexConfig: (...args: unknown[]) => mockUseCodexConfig(...args)
}))

vi.mock('@/hooks/queries/useCodexMcpStatus', () => ({
    useCodexMcpStatus: (...args: unknown[]) => mockUseCodexMcpStatus(...args)
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

        mockUseCodexSkills.mockReturnValue({
            entries: [{
                cwd: '/repo',
                skills: [{
                    name: 'deploy',
                    description: 'Deploy safely',
                    enabled: true,
                    scope: 'project',
                    path: '/repo/.codex/skills/deploy',
                    interface: {
                        displayName: 'Deploy',
                        shortDescription: 'Ship carefully'
                    }
                }],
                errors: []
            }],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })

        mockUseCodexConfig.mockReturnValue({
            data: {
                config: { model: 'gpt-5.4', mcp_servers: { github: {} } },
                origins: { model: 'user', mcp_servers: 'project' }
            },
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })

        mockUseCodexMcpStatus.mockReturnValue({
            data: {
                data: [{ name: 'github', status: 'ready', tools: [{ name: 'search' }], resources: [] }]
            },
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })

        mockUseCodexTools.mockReturnValue({
            unarchiveThread: vi.fn(),
            compactThread: vi.fn(),
            reloadMcpConfig: vi.fn(),
            writeConfigValue: writeConfigValueMock,
            batchWriteConfig: batchWriteConfigMock,
            isPending: false
        })
    })

    it('renders thread, history, skills, MCP and config sections for Codex sessions', () => {
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
        expect(screen.getByRole('button', { name: 'Compact Thread' })).toBeEnabled()
        expect(screen.getByText('Thread History')).toBeInTheDocument()
        expect(screen.getByText('Archived notes')).toBeInTheDocument()
        expect(screen.getByText('Skills')).toBeInTheDocument()
        expect(screen.getByText('Deploy')).toBeInTheDocument()
        expect(screen.getByText('MCP Servers')).toBeInTheDocument()
        expect(screen.getByText('github')).toBeInTheDocument()
        expect(screen.getByText('Config')).toBeInTheDocument()
        expect(screen.getByText(/"model": "gpt-5.4"/)).toBeInTheDocument()
    })

    it('writes a single config value from the config editor', async () => {
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

        fireEvent.change(screen.getByLabelText('Config Key Path'), {
            target: { value: 'apps._default.enabled' }
        })
        fireEvent.change(screen.getByLabelText('Config Value JSON'), {
            target: { value: 'false' }
        })
        fireEvent.click(screen.getByRole('button', { name: 'Write Config Value' }))

        await waitFor(() => {
            expect(writeConfigValueMock).toHaveBeenCalledWith({
                keyPath: 'apps._default.enabled',
                value: false,
                mergeStrategy: 'replace'
            })
        })
    })

    it('applies a config batch from JSON edits', async () => {
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

        fireEvent.change(screen.getByLabelText('Batch Config Edits JSON'), {
            target: {
                value: JSON.stringify([
                    {
                        keyPath: 'apps._default.enabled',
                        value: true,
                        mergeStrategy: 'upsert'
                    }
                ], null, 2)
            }
        })
        fireEvent.click(screen.getByRole('button', { name: 'Apply Config Batch' }))

        await waitFor(() => {
            expect(batchWriteConfigMock).toHaveBeenCalledWith({
                edits: [
                    {
                        keyPath: 'apps._default.enabled',
                        value: true,
                        mergeStrategy: 'upsert'
                    }
                ]
            })
        })
    })

    it('disables compact when remote live controls are unavailable and shows empty states', () => {
        mockUseCodexThreads.mockReturnValue({
            data: { data: [] },
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
        mockUseCodexSkills.mockReturnValue({
            entries: [],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
        mockUseCodexMcpStatus.mockReturnValue({
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

        expect(screen.getByRole('button', { name: 'Compact Thread' })).toBeDisabled()
        expect(screen.getAllByText('No threads found').length).toBeGreaterThan(0)
        expect(screen.getByText('No skills discovered')).toBeInTheDocument()
        expect(screen.getByText('No MCP servers configured')).toBeInTheDocument()
    })
})
