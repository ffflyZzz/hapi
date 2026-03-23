import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashRunnerCliApiToken } from './runnerIdentity';

const {
    mockReadRunnerState,
    mockClearRunnerState,
    mockReadSettings,
    mockIsProcessAlive,
    mockKillProcess,
    mockIsBunCompiled,
    mockProjectPath,
    mockExistsSync,
    mockStatSync,
    mockMkdirSync,
} = vi.hoisted(() => ({
    mockReadRunnerState: vi.fn(),
    mockClearRunnerState: vi.fn(),
    mockReadSettings: vi.fn(),
    mockIsProcessAlive: vi.fn(),
    mockKillProcess: vi.fn(),
    mockIsBunCompiled: vi.fn(),
    mockProjectPath: vi.fn(),
    mockExistsSync: vi.fn(),
    mockStatSync: vi.fn(),
    mockMkdirSync: vi.fn(),
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

vi.mock('@/persistence', () => ({
    readRunnerState: mockReadRunnerState,
    clearRunnerState: mockClearRunnerState,
    readSettings: mockReadSettings,
}));

vi.mock('@/utils/process', () => ({
    isProcessAlive: mockIsProcessAlive,
    killProcess: mockKillProcess,
}));

vi.mock('@/projectPath', () => ({
    isBunCompiled: mockIsBunCompiled,
    projectPath: mockProjectPath,
}));

vi.mock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    return {
        ...actual,
        existsSync: mockExistsSync,
        statSync: mockStatSync,
        mkdirSync: mockMkdirSync,
    };
});

import {
    checkIfRunnerRunningAndCleanupStaleState,
    getInstalledCliMtimeMs,
    isRunnerRunningCurrentlyInstalledHappyVersion,
    listRunnerSessions,
    notifyRunnerSessionStarted,
    spawnRunnerSession,
    stopRunner,
} from './controlClient';

describe('runner control client', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();

        mockReadRunnerState.mockReset();
        mockClearRunnerState.mockReset();
        mockReadSettings.mockReset();
        mockIsProcessAlive.mockReset();
        mockKillProcess.mockReset();
        mockIsBunCompiled.mockReset();
        mockProjectPath.mockReset();
        mockExistsSync.mockReset();
        mockStatSync.mockReset();
        mockMkdirSync.mockReset();

        mockKillProcess.mockResolvedValue(true);
        mockReadSettings.mockResolvedValue({});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        delete process.env.HAPI_API_URL;
        delete process.env.CLI_API_TOKEN;
    });

    it('returns empty sessions when runner is not started', async () => {
        mockReadRunnerState.mockResolvedValue(null);

        const sessions = await listRunnerSessions();

        expect(sessions).toEqual([]);
    });

    it('posts session-started payload to runner control server', async () => {
        mockReadRunnerState.mockResolvedValue({ pid: 321, httpPort: 7788 });
        mockIsProcessAlive.mockReturnValue(true);
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await notifyRunnerSessionStarted('session-1', {
            path: '/tmp',
            host: 'localhost',
            homeDir: '/home',
            happyHomeDir: '/hapi',
            happyLibDir: '/hapi/lib',
            happyToolsDir: '/hapi/tools',
            hostPid: 999,
            startedBy: 'runner',
            machineId: 'machine-1',
        });

        expect(result).toEqual({ success: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            'http://127.0.0.1:7788/session-started',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            }),
        );
    });

    it('returns structured error when runner HTTP returns non-2xx', async () => {
        mockReadRunnerState.mockResolvedValue({ pid: 321, httpPort: 8899 });
        mockIsProcessAlive.mockReturnValue(true);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({}),
        }));

        const response = await spawnRunnerSession('/tmp/worktree');

        expect(response.error).toContain('HTTP 503');
    });

    it('cleans stale runner state when pid is no longer alive', async () => {
        mockReadRunnerState.mockResolvedValue({ pid: 777 });
        mockIsProcessAlive.mockReturnValue(false);
        mockClearRunnerState.mockResolvedValue(undefined);

        const alive = await checkIfRunnerRunningAndCleanupStaleState();

        expect(alive).toBe(false);
        expect(mockClearRunnerState).toHaveBeenCalledTimes(1);
    });

    it('prefers mtime comparison when available', async () => {
        process.env.CLI_API_TOKEN = 'token-1';
        const state = {
            pid: 55,
            startedWithCliVersion: 'stale',
            startedWithCliMtimeMs: 123456,
            startedWithApiUrl: 'http://localhost:3006',
            startedWithMachineId: 'machine-1',
            startedWithCliApiTokenHash: hashRunnerCliApiToken('token-1'),
        };
        mockReadRunnerState.mockResolvedValueOnce(state).mockResolvedValueOnce(state);
        mockReadSettings.mockResolvedValue({ apiUrl: 'http://localhost:3006', machineId: 'machine-1' });
        mockIsProcessAlive.mockReturnValue(true);
        mockIsBunCompiled.mockReturnValue(false);
        mockProjectPath.mockReturnValue('/tmp/hapi-dev');
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ mtimeMs: 123456 });

        const matches = await isRunnerRunningCurrentlyInstalledHappyVersion();

        expect(matches).toBe(true);
    });

    it('uses package version comparison when mtime is unavailable', async () => {
        process.env.CLI_API_TOKEN = 'token-1';
        const state = {
            pid: 88,
            startedWithCliVersion: '0.16.3',
            startedWithApiUrl: 'http://localhost:3006',
            startedWithMachineId: 'machine-1',
            startedWithCliApiTokenHash: hashRunnerCliApiToken('token-1'),
        };
        mockReadRunnerState.mockResolvedValueOnce(state).mockResolvedValueOnce(state);
        mockReadSettings.mockResolvedValue({ apiUrl: 'http://localhost:3006', machineId: 'machine-1' });
        mockIsProcessAlive.mockReturnValue(true);
        mockIsBunCompiled.mockReturnValue(false);
        mockProjectPath.mockReturnValue('/tmp/hapi-dev');
        mockExistsSync.mockReturnValue(false);

        const matches = await isRunnerRunningCurrentlyInstalledHappyVersion();

        expect(matches).toBe(true);
    });

    it('waits for graceful stop and falls back to force kill when process stays alive', async () => {
        vi.useFakeTimers();
        mockReadRunnerState.mockResolvedValue({ pid: 42, httpPort: 6600 });
        mockIsProcessAlive.mockReturnValue(true);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({}),
        }));

        const stopPromise = stopRunner();
        await vi.advanceTimersByTimeAsync(3_000);
        await stopPromise;

        expect(mockKillProcess).toHaveBeenCalledWith(42, true);
    });

    it('reads installed CLI mtime from package.json in source mode', () => {
        mockIsBunCompiled.mockReturnValue(false);
        mockProjectPath.mockReturnValue('/tmp/hapi-dev');
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ mtimeMs: 9000 });

        expect(getInstalledCliMtimeMs()).toBe(9000);
    });
});
