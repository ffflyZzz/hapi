import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getTelegramWebApp } from './useTelegram'

type ColorScheme = 'light' | 'dark'
export type AppearancePreference = 'system' | 'dark' | 'light'
export type ColorPreset = 'default' | 'natural'

type ColorPresetOption = {
    value: ColorPreset
    labelKey: string
}

const APPEARANCE_KEY = 'hapi-appearance'
const COLOR_PRESET_STORAGE_KEY = 'hapi-color-preset'

const COLOR_PRESET_OPTIONS: ReadonlyArray<ColorPresetOption> = [
    { value: 'default', labelKey: 'settings.display.colorPreset.default' },
    { value: 'natural', labelKey: 'settings.display.colorPreset.natural' },
]

function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function safeGetItem(key: string): string | null {
    if (!isBrowser()) return null
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function safeSetItem(key: string, value: string): void {
    if (!isBrowser()) return
    try {
        localStorage.setItem(key, value)
    } catch {
        // Ignore storage errors
    }
}

function safeRemoveItem(key: string): void {
    if (!isBrowser()) return
    try {
        localStorage.removeItem(key)
    } catch {
        // Ignore storage errors
    }
}

function parseAppearance(raw: string | null): AppearancePreference {
    if (raw === 'dark' || raw === 'light') return raw
    return 'system'
}

function getStoredAppearance(): AppearancePreference {
    return parseAppearance(safeGetItem(APPEARANCE_KEY))
}

function isColorPreset(value: string | null): value is ColorPreset {
    return value === 'default' || value === 'natural'
}

function getColorPreset(): ColorPreset {
    const stored = safeGetItem(COLOR_PRESET_STORAGE_KEY)
    return isColorPreset(stored) ? stored : 'default'
}

export function getAppearanceOptions(): ReadonlyArray<{ value: AppearancePreference; labelKey: string }> {
    return [
        { value: 'system', labelKey: 'settings.display.appearance.system' },
        { value: 'dark', labelKey: 'settings.display.appearance.dark' },
        { value: 'light', labelKey: 'settings.display.appearance.light' },
    ]
}

export function getColorPresetOptions(): ReadonlyArray<ColorPresetOption> {
    return COLOR_PRESET_OPTIONS
}

function getColorScheme(): ColorScheme {
    const pref = getStoredAppearance()
    if (pref === 'dark' || pref === 'light') return pref

    const tg = getTelegramWebApp()
    if (tg?.colorScheme) {
        return tg.colorScheme === 'dark' ? 'dark' : 'light'
    }

    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }

    return 'light'
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

let currentScheme: ColorScheme = getColorScheme()
let currentColorPreset: ColorPreset = getColorPreset()
let themeVersion = 0
const listeners = new Set<() => void>()

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

function onColorPresetStorageChange(event: StorageEvent): void {
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

export function useAppearance(): { appearance: AppearancePreference; setAppearance: (pref: AppearancePreference) => void } {
    const [appearance, setAppearanceState] = useState<AppearancePreference>(getStoredAppearance)

    useEffect(() => {
        if (!isBrowser()) return

        const onStorage = (event: StorageEvent) => {
            if (event.key !== APPEARANCE_KEY) return
            setAppearanceState(parseAppearance(event.newValue))
        }

        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    const setAppearance = useCallback((pref: AppearancePreference) => {
        setAppearanceState(pref)

        if (pref === 'system') {
            safeRemoveItem(APPEARANCE_KEY)
        } else {
            safeSetItem(APPEARANCE_KEY, pref)
        }

        updateScheme()
    }, [])

    return { appearance, setAppearance }
}

export function initializeTheme(): void {
    currentScheme = getColorScheme()
    currentColorPreset = getColorPreset()
    applyTheme(currentScheme)
    applyColorPreset(currentColorPreset)
    applyPlatform()

    if (!listenersInitialized) {
        listenersInitialized = true
        const tg = getTelegramWebApp()
        if (tg?.onEvent) {
            tg.onEvent('themeChanged', updateScheme)
        } else if (typeof window !== 'undefined' && window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
            mediaQuery.addEventListener('change', updateScheme)
        }

        if (typeof window !== 'undefined') {
            window.addEventListener('storage', (event: StorageEvent) => {
                if (event.key === APPEARANCE_KEY) {
                    updateScheme()
                    return
                }
                onColorPresetStorageChange(event)
            })
        }
    }
}
