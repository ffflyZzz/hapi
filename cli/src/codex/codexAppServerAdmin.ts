import { CodexAppServerClient } from './codexAppServerClient';
import type {
    ConfigBatchWriteParams,
    ConfigBatchWriteResponse,
    ConfigMcpServerReloadResponse,
    ConfigReadParams,
    ConfigReadResponse,
    ConfigValueWriteParams,
    ConfigValueWriteResponse,
    McpServerStatusListParams,
    McpServerStatusListResponse,
    SkillsListParams,
    SkillsListResponse,
    ThreadListParams,
    ThreadListResponse,
    ThreadReadParams,
    ThreadReadResponse,
    ThreadUnarchiveParams,
    ThreadUnarchiveResponse
} from './appServerTypes';

const INITIALIZE_PARAMS = {
    clientInfo: {
        name: 'hapi-codex-admin-client',
        version: '1.0.0'
    },
    capabilities: {
        experimentalApi: true
    }
} as const;

async function withCodexAppServerClient<T>(
    run: (client: CodexAppServerClient) => Promise<T>
): Promise<T> {
    const client = new CodexAppServerClient();
    try {
        await client.connect();
        await client.initialize(INITIALIZE_PARAMS);
        return await run(client);
    } finally {
        await client.disconnect();
    }
}

export async function readCodexThread(params: ThreadReadParams): Promise<ThreadReadResponse> {
    return await withCodexAppServerClient((client) => client.readThread(params));
}

export async function listCodexThreads(params?: ThreadListParams): Promise<ThreadListResponse> {
    return await withCodexAppServerClient((client) => client.listThreads(params));
}

export async function unarchiveCodexThread(params: ThreadUnarchiveParams): Promise<ThreadUnarchiveResponse> {
    return await withCodexAppServerClient((client) => client.unarchiveThread(params));
}

export async function listCodexSkills(params?: SkillsListParams): Promise<SkillsListResponse> {
    return await withCodexAppServerClient((client) => client.listSkills(params));
}

export async function readCodexConfig(params?: ConfigReadParams): Promise<ConfigReadResponse> {
    return await withCodexAppServerClient((client) => client.readConfig(params));
}

export async function writeCodexConfigValue(params: ConfigValueWriteParams): Promise<ConfigValueWriteResponse> {
    return await withCodexAppServerClient((client) => client.writeConfigValue(params));
}

export async function batchWriteCodexConfig(params: ConfigBatchWriteParams): Promise<ConfigBatchWriteResponse> {
    return await withCodexAppServerClient((client) => client.batchWriteConfig(params));
}

export async function reloadCodexMcpServerConfig(): Promise<ConfigMcpServerReloadResponse> {
    return await withCodexAppServerClient((client) => client.reloadMcpServerConfig());
}

export async function listCodexMcpServerStatus(
    params?: McpServerStatusListParams
): Promise<McpServerStatusListResponse> {
    return await withCodexAppServerClient((client) => client.listMcpServerStatus(params));
}
