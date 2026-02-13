import type { PermissionMode } from '@/claude/loop';

export const ROOT_BYPASS_PERMISSIONS_WARNING =
    'Claude disallows bypassPermissions (--yolo) when running as root. Falling back to default mode.';

export function normalizePermissionModeForRuntime(
    mode: PermissionMode,
    isRootUser: boolean
): { mode: PermissionMode; warning?: string } {
    if (isRootUser && mode === 'bypassPermissions') {
        return {
            mode: 'default',
            warning: ROOT_BYPASS_PERMISSIONS_WARNING
        };
    }

    return { mode };
}
