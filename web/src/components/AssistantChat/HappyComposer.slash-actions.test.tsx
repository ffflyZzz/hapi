import type { ReactNode, TextareaHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { HappyComposer } from './HappyComposer'

const setTextMock = vi.fn()
const sendMock = vi.fn()
const addAttachmentMock = vi.fn()
const cancelRunMock = vi.fn()
const impactMock = vi.fn()
const notificationMock = vi.fn()

const assistantState = {
    composer: {
        text: '',
        attachments: [] as unknown[]
    },
    thread: {
        isRunning: false,
        isDisabled: false
    }
}

vi.mock('@assistant-ui/react', async () => {
    const React = await import('react')

    type InputProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
        maxRows?: number
        submitOnEnter?: boolean
        cancelOnEscape?: boolean
    }

    return {
        useAssistantApi: () => ({
            composer: () => ({
                setText: setTextMock,
                send: sendMock,
                addAttachment: addAttachmentMock,
            }),
            thread: () => ({
                cancelRun: cancelRunMock,
            })
        }),
        useAssistantState: (selector: (state: typeof assistantState) => unknown) => selector(assistantState),
        ComposerPrimitive: {
            Root: ({ children, onSubmit, className }: { children: ReactNode; onSubmit?: (event?: unknown) => void; className?: string }) => (
                <form
                    className={className}
                    onSubmit={(event) => {
                        event.preventDefault()
                        onSubmit?.(event)
                    }}
                >
                    {children}
                </form>
            ),
            Input: React.forwardRef<HTMLTextAreaElement, InputProps>(
                ({ maxRows: _maxRows, submitOnEnter: _submitOnEnter, cancelOnEscape: _cancelOnEscape, ...props }, ref) => (
                    <textarea ref={ref} aria-label="Composer Input" {...props} />
                )
            ),
            Attachments: () => null,
        }
    }
})

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            impact: impactMock,
            notification: notificationMock,
        },
        isTouch: false,
    })
}))

vi.mock('@/hooks/usePWAInstall', () => ({
    usePWAInstall: () => ({
        isStandalone: false,
        isIOS: false,
    })
}))

vi.mock('@/components/AssistantChat/StatusBar', () => ({
    StatusBar: () => null,
}))

vi.mock('@/components/AssistantChat/ComposerButtons', () => ({
    ComposerButtons: ({ onSend }: { onSend: () => void }) => (
        <button type="button" onClick={onSend}>Send</button>
    ),
}))

vi.mock('@/components/ChatInput/FloatingOverlay', () => ({
    FloatingOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/AssistantChat/AttachmentItem', () => ({
    AttachmentItem: () => null,
}))

function renderWithProviders(ui: ReactNode) {
    return render(<I18nProvider>{ui}</I18nProvider>)
}

describe('HappyComposer slash actions', () => {
    beforeEach(() => {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            value: vi.fn(),
            configurable: true,
            writable: true,
        })
        vi.clearAllMocks()
        assistantState.composer.text = ''
        assistantState.composer.attachments = []
        assistantState.thread.isRunning = false
        assistantState.thread.isDisabled = false
    })

    afterEach(() => {
        cleanup()
    })

    it('opens /skills picker and inserts a selected skill token into the composer', async () => {
        const autocompleteSuggestions = vi.fn(async (query: string): Promise<Suggestion[]> => {
            if (query.startsWith('/')) {
                return [
                    {
                        key: '/skills',
                        text: '/skills',
                        label: '/skills',
                        description: 'Select a skill to insert',
                        source: 'builtin'
                    }
                ]
            }

            if (query.startsWith('$')) {
                return [
                    {
                        key: '$deploy',
                        text: '$deploy',
                        label: '$deploy',
                        description: 'Deploy safely',
                        source: 'builtin'
                    }
                ]
            }

            return []
        })

        renderWithProviders(
            <HappyComposer
                agentFlavor="codex"
                active
                autocompleteSuggestions={autocompleteSuggestions}
            />
        )

        const input = screen.getByLabelText('Composer Input')
        fireEvent.change(input, {
            target: {
                value: '/sk',
                selectionStart: 3,
                selectionEnd: 3,
            }
        })

        const slashLabel = await screen.findByText('/skills')
        fireEvent.click(slashLabel.closest('button') as HTMLButtonElement)

        expect(await screen.findByRole('dialog')).toBeInTheDocument()
        expect(await screen.findByText('$deploy')).toBeInTheDocument()
        expect(setTextMock).not.toHaveBeenCalled()

        const skillLabel = screen.getByText('$deploy')
        fireEvent.click(skillLabel.closest('button') as HTMLButtonElement)

        await waitFor(() => {
            expect(setTextMock).toHaveBeenCalledWith('$deploy ')
        })
        expect(sendMock).not.toHaveBeenCalled()
    })

    it('opens /compact confirmation and executes immediately after confirm', async () => {
        const autocompleteSuggestions = vi.fn(async (query: string): Promise<Suggestion[]> => {
            if (query.startsWith('/')) {
                return [
                    {
                        key: '/compact',
                        text: '/compact',
                        label: '/compact',
                        description: 'Compact context',
                        source: 'builtin'
                    }
                ]
            }
            return []
        })

        renderWithProviders(
            <HappyComposer
                agentFlavor="codex"
                active
                autocompleteSuggestions={autocompleteSuggestions}
            />
        )

        const input = screen.getByLabelText('Composer Input')
        fireEvent.change(input, {
            target: {
                value: '/co',
                selectionStart: 3,
                selectionEnd: 3,
            }
        })

        const compactLabel = await screen.findByText('/compact')
        fireEvent.click(compactLabel.closest('button') as HTMLButtonElement)

        expect(await screen.findByRole('dialog')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Compact Now' }))

        await waitFor(() => {
            expect(setTextMock).toHaveBeenCalledWith('/compact')
            expect(sendMock).toHaveBeenCalledTimes(1)
        })
    })
})
