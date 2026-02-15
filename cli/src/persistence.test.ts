import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const {
    mockIsProcessAlive,
    mockConfiguration,
} = vi.hoisted(() => ({
    mockIsProcessAlive: vi.fn(),
    mockConfiguration: {
        happyHomeDir: '',
        settingsFile: '',
        privateKeyFile: '',
        runnerStateFile: '',
        runnerLockFile: '',
    },
}));

vi.mock('@/configuration', () => ({
    configuration: mockConfiguration,
}));

vi.mock('@/utils/process', () => ({
    isProcessAlive: mockIsProcessAlive,
}));

import {
    acquireRunnerLock,
    clearCredentials,
    clearMachineId,
    clearRunnerState,
    readRunnerState,
    readSettings,
    releaseRunnerLock,
    updateSettings,
    writeCredentialsDataKey,
    writeRunnerState,
    writeSettings,
} from './persistence';

describe('persistence core flows', () => {
    let testDir = '';

    beforeEach(() => {
        testDir = mkdtempSync(join(tmpdir(), 'hapi-persistence-'));
        mockConfiguration.happyHomeDir = testDir;
        mockConfiguration.settingsFile = join(testDir, 'settings.json');
        mockConfiguration.privateKeyFile = join(testDir, 'access.key');
        mockConfiguration.runnerStateFile = join(testDir, 'runner.state.json');
        mockConfiguration.runnerLockFile = join(testDir, 'runner.state.json.lock');
        mockIsProcessAlive.mockReset();
        mockIsProcessAlive.mockReturnValue(true);
    });

    afterEach(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    it('reads default settings when file is missing or invalid', async () => {
        expect(await readSettings()).toEqual({});

        writeFileSync(mockConfiguration.settingsFile, '{invalid-json');
        expect(await readSettings()).toEqual({});
    });

    it('writes and updates settings atomically', async () => {
        await writeSettings({ machineId: 'machine-a', apiUrl: 'http://localhost:3006' });
        expect(await readSettings()).toMatchObject({
            machineId: 'machine-a',
            apiUrl: 'http://localhost:3006',
        });

        const updated = await updateSettings((current) => ({
            ...current,
            runnerAutoStartWhenRunningHappy: true,
        }));

        expect(updated).toMatchObject({
            machineId: 'machine-a',
            runnerAutoStartWhenRunningHappy: true,
        });
    });

    it('clears machine id while preserving other settings', async () => {
        await writeSettings({
            machineId: 'machine-a',
            apiUrl: 'http://localhost:3006',
            cliApiToken: 'token',
        });

        await clearMachineId();
        const settings = await readSettings();

        expect(settings.machineId).toBeUndefined();
        expect(settings.apiUrl).toBe('http://localhost:3006');
        expect(settings.cliApiToken).toBe('token');
    });

    it('writes encrypted credential material and clears it', async () => {
        await writeCredentialsDataKey({
            publicKey: new Uint8Array([1, 2, 3]),
            machineKey: new Uint8Array([4, 5, 6]),
            token: 'api-token',
        });

        const stored = JSON.parse(readFileSync(mockConfiguration.privateKeyFile, 'utf8'));
        expect(stored.token).toBe('api-token');
        expect(stored.encryption.publicKey).toBe(Buffer.from([1, 2, 3]).toString('base64'));
        expect(stored.encryption.machineKey).toBe(Buffer.from([4, 5, 6]).toString('base64'));

        await clearCredentials();
        expect(existsSync(mockConfiguration.privateKeyFile)).toBe(false);
    });

    it('writes/reads/clears runner state and lock file', async () => {
        const state = {
            pid: 12345,
            httpPort: 7788,
            startTime: new Date().toISOString(),
            startedWithCliVersion: '0.7.3',
            runnerLogPath: join(testDir, 'runner.log'),
        };

        writeRunnerState(state);
        expect(await readRunnerState()).toEqual(state);

        writeFileSync(mockConfiguration.runnerLockFile, '12345');
        await clearRunnerState();
        expect(await readRunnerState()).toBeNull();
        expect(existsSync(mockConfiguration.runnerLockFile)).toBe(false);
    });

    it('acquires and releases runner lock', async () => {
        const lockHandle = await acquireRunnerLock(1, 1);
        expect(lockHandle).not.toBeNull();
        expect(existsSync(mockConfiguration.runnerLockFile)).toBe(true);

        await releaseRunnerLock(lockHandle!);
        expect(existsSync(mockConfiguration.runnerLockFile)).toBe(false);
    });

    it('replaces stale runner lock when pid is dead', async () => {
        writeFileSync(mockConfiguration.runnerLockFile, '999999');
        mockIsProcessAlive.mockReturnValue(false);

        const lockHandle = await acquireRunnerLock(2, 1);
        expect(lockHandle).not.toBeNull();

        await releaseRunnerLock(lockHandle!);
    });

    it('returns null when lock is held by a live process', async () => {
        writeFileSync(mockConfiguration.runnerLockFile, String(process.pid));
        mockIsProcessAlive.mockReturnValue(true);

        const lockHandle = await acquireRunnerLock(1, 1);
        expect(lockHandle).toBeNull();
    });
});
