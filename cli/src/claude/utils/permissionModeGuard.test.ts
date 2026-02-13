import { describe, expect, it } from 'vitest';
import {
    normalizePermissionModeForRuntime,
    ROOT_BYPASS_PERMISSIONS_WARNING
} from './permissionModeGuard';

describe('normalizePermissionModeForRuntime', () => {
    it('keeps bypassPermissions for non-root users', () => {
        const result = normalizePermissionModeForRuntime('bypassPermissions', false);
        expect(result).toEqual({ mode: 'bypassPermissions' });
    });

    it('falls back to default for root users in bypassPermissions mode', () => {
        const result = normalizePermissionModeForRuntime('bypassPermissions', true);
        expect(result).toEqual({
            mode: 'default',
            warning: ROOT_BYPASS_PERMISSIONS_WARNING
        });
    });

    it('keeps safe modes for root users', () => {
        const result = normalizePermissionModeForRuntime('acceptEdits', true);
        expect(result).toEqual({ mode: 'acceptEdits' });
    });
});
