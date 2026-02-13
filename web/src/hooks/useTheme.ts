import { useSyncExternalStore } from 'react'
import { getTelegramWebApp } from './useTelegram'

type ColorScheme = 'light' | 'dark'
export type ColorPreset = 'default' | 'natural'

type ColorPresetOption = {
    value: ColorPreset
    labelKey: string
}

const COLOR_PRESET_STORAGE_KEY = 'hapi-color-preset'

const COLOR_PRESET_OPTIONS: ReadonlyArray<ColorPresetOption> = [
    { value: 'default', labelKey: 'settings.display.colorPreset.default' },
    { value: 'natural', labelKey: 'settings.display.colorPreset.natural' },
]

function isColorPreset(value: string | null): value is ColorPreset {
    return value === 'default' || value === 'natural'
}

function safeGetItem(key: string): string | null {
    if (typeof window === 'undefined') {
        return null
    }
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function safeSetItem(key: string, value: string): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        localStorage.setItem(key, value)
    } catch {
        // Ignore storage errors
    }
}

function safeRemoveItem(key: string): void {
    if (typeof window === 'undefined') {
        return
    }
    try {
        localStorage.removeItem(key)
    } catch {
        // Ignore storage errors
    }
}

function getColorScheme(): ColorScheme {
    const tg = getTelegramWebApp()
    if (tg?.colorScheme) {
        return tg.colorScheme === 'dark' ? 'dark' : 'light'
    }

    // Fallback to system preference for browser environment
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }

    return 'light'
}

function getColorPreset(): ColorPreset {
    const stored = safeGetItem(COLOR_PRESET_STORAGE_KEY)
    return isColorPreset(stored) ? stored : 'default'
}

function isIOS(): boolean {
    if (typeof navigator === 'undefined') {
        return false
    }
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function applyTheme(scheme: ColorScheme): void {
    if (typeof document === 'undefined') {
        return
    }
    document.documentElement.setAttribute('data-theme', scheme)
}

function applyColorPreset(preset: ColorPreset): void {
    if (typeof document === 'undefined') {
        return
    }
    if (preset === 'default') {
        document.documentElement.removeAttribute('data-color-preset')
        return
    }
    document.documentElement.setAttribute('data-color-preset', preset)
}

function applyPlatform(): void {
    if (typeof document === 'undefined') {
        return
    }
    if (isIOS()) {
        document.documentElement.classList.add('ios')
    }
}

// External store for theme state
let currentScheme: ColorScheme = getColorScheme()
let currentColorPreset: ColorPreset = getColorPreset()
let themeVersion = 0
const listeners = new Set<() => void>()

// Apply theme immediately at module load (before React renders)
applyTheme(currentScheme)
applyColorPreset(currentColorPreset)

function subscribe(callback: () => void): () => void {
    listeners.add(callback)
    return () => listeners.delete(callback)
}

function getSnapshot(): number {
    return themeVersion
}

function emitStoreChange(): void {
    themeVersion += 1
    listeners.forEach((cb) => cb())
}

function updateScheme(): void {
    const newScheme = getColorScheme()
    if (newScheme !== currentScheme) {
        currentScheme = newScheme
        applyTheme(newScheme)
        emitStoreChange()
    }
}

function onStorageChange(event: StorageEvent): void {
    if (event.key !== COLOR_PRESET_STORAGE_KEY) {
        return
    }
    const nextPreset = isColorPreset(event.newValue) ? event.newValue : 'default'
    if (nextPreset === currentColorPreset) {
        return
    }
    currentColorPreset = nextPreset
    applyColorPreset(nextPreset)
    emitStoreChange()
}

export function getColorPresetOptions(): ReadonlyArray<ColorPresetOption> {
    return COLOR_PRESET_OPTIONS
}

export function setColorPreset(preset: ColorPreset): void {
    if (preset === currentColorPreset) {
        return
    }
    currentColorPreset = preset
    if (preset === 'default') {
        safeRemoveItem(COLOR_PRESET_STORAGE_KEY)
    } else {
        safeSetItem(COLOR_PRESET_STORAGE_KEY, preset)
    }
    applyColorPreset(preset)
    emitStoreChange()
}

// Track if theme listeners have been set up
let listenersInitialized = false

export function useTheme(): {
    colorScheme: ColorScheme
    colorPreset: ColorPreset
    isDark: boolean
    setColorPreset: (preset: ColorPreset) => void
} {
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    return {
        colorScheme: currentScheme,
        colorPreset: currentColorPreset,
        isDark: currentScheme === 'dark',
        setColorPreset,
    }
}

// Call this once at app startup to ensure theme is applied and listeners attached
export function initializeTheme(): void {
    currentScheme = getColorScheme()
    currentColorPreset = getColorPreset()
    applyTheme(currentScheme)
    applyColorPreset(currentColorPreset)
    applyPlatform()

    // Set up listeners only once (after SDK may have loaded)
    if (!listenersInitialized) {
        listenersInitialized = true
        const tg = getTelegramWebApp()
        if (tg?.onEvent) {
            // Telegram theme changes
            tg.onEvent('themeChanged', updateScheme)
        } else if (typeof window !== 'undefined' && window.matchMedia) {
            // Browser system preference changes
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
            mediaQuery.addEventListener('change', updateScheme)
        }

        if (typeof window !== 'undefined') {
            window.addEventListener('storage', onStorageChange)
        }
    }
}
