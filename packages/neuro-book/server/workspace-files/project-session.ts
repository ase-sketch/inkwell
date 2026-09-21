import path from "node:path";
import type {AbsoluteFsPath} from "nbook/server/runtime/paths/file-path";
import {resolveRuntimeArtifactCompilerContext} from "nbook/server/utils/runtime-artifact-compiler-context";
import {
    projectWorkspaceRef,
    type ProjectWorkspaceRef,
} from "nbook/server/workspace-files/project-identity";
import {
    ProjectLifecycle,
    type ProjectCandidateSnapshot,
    type ProjectCoverUpdateInput,
    type ProjectCoverUpdateResult,
    type ProjectCreateInput,
    type ProjectCreateResult,
    type ProjectDeleteResult,
    type ProjectListSnapshot,
    type ProjectMetadataUpdateInput,
    type ProjectMetadataUpdateResult,
} from "nbook/server/workspace-files/project-lifecycle";
import type {
    ProjectModuleHandle,
    ProjectModuleToken,
} from "nbook/server/workspace-files/project-module";
import {
    PROJECT_GRACE_MS,
    ProjectSessionRuntime,
    type ProjectOperationStart,
    type ProjectSessionCloseReason,
    type ReadyProjectSessionRef,
} from "nbook/server/workspace-files/project-session-runtime";
import {
    isProjectNotOpenError,
    ProjectNotOpenError,
    ProjectSessionService,
    type ProjectControlOpenResult,
} from "nbook/server/workspace-files/project-session-service";
import type {ProjectOpener} from "nbook/server/workspace-files/project-session-types";
import {collectReleasedSqliteHandles} from "nbook/server/workspace-files/sqlite-handle-release";
import {runtimePathsFromEnv} from "nbook/server/runtime/paths/runtime-paths";
import {resolveRuntimeWorkspaceRoot} from "nbook/server/workspace-files/workspace-runtime-root";

// Production composition root：required与lazy descriptor在任何Project open前完成注册。
import "nbook/server/workspace-files/project-database-module";
import "nbook/server/workspace-history/project-history";
import "nbook/server/workspace-files/project-file-index";
import "nbook/server/plot/index";
import "nbook/server/agent/tools/agent-sql-project-module";

export {isProjectNotOpenError, PROJECT_GRACE_MS, ProjectNotOpenError};
export type {ProjectOpener, ProjectOperationStart, ReadyProjectSessionRef};

const MAINTENANCE_INTERVAL_MS = 30_000;

type ProjectSessionGlobalState = {
    lifecycle: ProjectLifecycle | null;
    service: ProjectSessionService | null;
    workspaceRoot: AbsoluteFsPath | null;
    compilerRoot: AbsoluteFsPath | null;
    compilerContext: ReturnType<typeof resolveRuntimeArtifactCompilerContext> | null;
    agentProbe: ((session: ReadyProjectSessionRef) => boolean) | null;
    maintenanceTimer: ReturnType<typeof setInterval> | null;
    sweepInFlight: boolean;
};

type ProjectOccupancySnapshot = {
    readonly state: "open" | "grace";
    readonly userConnections: number;
    readonly agentActive: boolean;
};

type OpenProjectSnapshot = ProjectOccupancySnapshot & {
    readonly projectRoot: string;
    readonly openedAt: string;
    readonly lastActivityAt: string;
};

const globalForProjectSession = globalThis as typeof globalThis & {
    __nbookProjectSessionV2?: ProjectSessionGlobalState;
};
const globalState = globalForProjectSession.__nbookProjectSessionV2 ??= {
    lifecycle: null,
    service: null,
    workspaceRoot: null,
    compilerRoot: null,
    compilerContext: null,
    agentProbe: null,
    maintenanceTimer: null,
    sweepInFlight: false,
};

/**
 * 打开结构化 Project ref。
 *
 * Facade 只接受 `ProjectWorkspaceRef`：字符串身份在 HTTP / CLI 入口一次性收窄，
 * 之后的调用链没有任何再次「从路径求根」的口子。
 */
export async function openProject(
    ref: ProjectWorkspaceRef,
    opener: ProjectOpener,
    workspaceRoot?: AbsoluteFsPath,
): Promise<ReadyProjectSessionRef> {
    const service = serviceFor(workspaceRoot ?? resolveRuntimeWorkspaceRoot());
    const ready = await service.openProject(ref, opener);
    ensureMaintenanceTimer();
    return ready;
}

/** 产品控制面结构化open，同时返回最终Project publication与ready generation。 */
export async function openProjectControl(
    ref: ProjectWorkspaceRef,
    opener: ProjectOpener,
): Promise<ProjectControlOpenResult> {
    const service = serviceFor(resolveRuntimeWorkspaceRoot());
    const result = await service.openProjectControl(ref, opener);
    ensureMaintenanceTimer();
    return result;
}

/** 读取唯一Lifecycle的轻量Project列表snapshot；测试与独立 Harness 可显式指定 Workspace Root。 */
export function listProjects(workspaceRoot?: AbsoluteFsPath): Promise<ProjectListSnapshot> {
    return serviceFor(workspaceRoot ?? resolveRuntimeWorkspaceRoot()).listProjects();
}

/** 读取与Project列表同revision的一级候选目录。 */
export function listProjectCandidates(): Promise<ProjectCandidateSnapshot> {
    return serviceFor(resolveRuntimeWorkspaceRoot()).listCandidates();
}

/** 通过唯一Lifecycle创建Project；创建不隐式打开Session。 */
export function createProject(input: ProjectCreateInput): Promise<ProjectCreateResult> {
    return serviceFor(resolveRuntimeWorkspaceRoot()).createProject(input);
}

/** 通过唯一Service更新Project metadata，并自动选择borrowed或owned Occupancy。 */
export function updateProjectMetadata(input: ProjectMetadataUpdateInput): Promise<ProjectMetadataUpdateResult> {
    return serviceFor(resolveRuntimeWorkspaceRoot()).updateProjectMetadata(input);
}

/** 通过唯一 Service 更新 Project 封面，并自动选择 borrowed 或 owned Occupancy。 */
export function updateProjectCover(input: ProjectCoverUpdateInput): Promise<ProjectCoverUpdateResult> {
    return serviceFor(resolveRuntimeWorkspaceRoot()).updateProjectCover(input);
}

/** 删除已经显式关闭的Project；本入口绝不隐式close。 */
export function deleteProject(ref: ProjectWorkspaceRef): Promise<ProjectDeleteResult> {
    return serviceFor(resolveRuntimeWorkspaceRoot()).deleteProject(ref);
}

/** strict-open accessor：只返回当前结构化Project的ready generation。 */
export function requireReadyProject(ref: ProjectWorkspaceRef): ReadyProjectSessionRef {
    const service = globalState.service;
    if (!service) {
        throw new ProjectNotOpenError(ref.projectRoot);
    }
    return service.requireReadyProject(ref);
}

/**
 * 数据面入口：取得 ready Project 并顺带刷新活动时间。
 * 返回值之后必须沿调用链传播，业务 Module 不得再次求根。
 */
export function requireActiveReadyProject(ref: ProjectWorkspaceRef): ReadyProjectSessionRef {
    const ready = requireReadyProject(ref);
    markProjectActivity(ready.workspace.ref);
    return ready;
}

/** 使用入口已经捕获的精确 ready generation 取得 Module handle。 */
export function requireReadyModuleHandle<THandle extends ProjectModuleHandle>(
    ready: ReadyProjectSessionRef,
    token: ProjectModuleToken<THandle>,
): THandle {
    const service = globalState.service;
    if (!service) {
        throw new ProjectNotOpenError(ready.workspace.ref.projectRoot);
    }
    return service.requireReadyModuleHandle(ready, token);
}

/** 使用入口捕获的精确 ready generation 激活 lazy Module，拒绝 close/reopen 后串代。 */
export function activateReadyProjectModule<THandle extends ProjectModuleHandle>(
    ready: ReadyProjectSessionRef,
    token: ProjectModuleToken<THandle>,
): Promise<THandle> {
    const service = globalState.service;
    if (!service) {
        return Promise.reject(new ProjectNotOpenError(ready.workspace.ref.projectRoot));
    }
    return service.activateReadyProjectModule(ready, token);
}

/**
 * 在精确ready generation同步登记一次异步数据面操作。
 * terminal close会先封住后续登记，再等待本入口已经接纳的操作settle。
 */
export function runReadyProjectOperation<TResult>(
    ready: ReadyProjectSessionRef,
    operation: (signal: AbortSignal) => Promise<TResult>,
): Promise<TResult> {
    const service = globalState.service;
    if (!service) {
        return Promise.reject(new ProjectNotOpenError(ready.workspace.ref.projectRoot));
    }
    return service.runReadyProjectOperation(ready, operation);
}

/**
 * 同步启动长生命周期数据面操作：start同步返回result，completion到最终terminal才允许close继续。
 * 适用于Workflow这类先返回runId、随后跨waiting状态继续运行的后台任务。
 */
export function startReadyProjectOperation<TResult>(
    ready: ReadyProjectSessionRef,
    start: (signal: AbortSignal) => ProjectOperationStart<TResult>,
): TResult {
    const service = globalState.service;
    if (!service) {
        throw new ProjectNotOpenError(ready.workspace.ref.projectRoot);
    }
    return service.startReadyProjectOperation(ready, start);
}

/** 数据面守卫；grace仍属于ready。 */
export function assertProjectOpen(ref: ProjectWorkspaceRef): void {
    requireReadyProject(ref);
}

/** Project当前是否发布ready generation。 */
export function isProjectOpen(ref: ProjectWorkspaceRef): boolean {
    try {
        assertProjectOpen(ref);
        return true;
    } catch {
        return false;
    }
}

/** 返回全部ready generation的轻量presence投影。 */
export function listOpenProjects(): OpenProjectSnapshot[] {
    return globalState.service?.listOpenProjects().map(({ref, ...presence}) => ({
        projectRoot: ref.projectRoot,
        ...presence,
    })) ?? [];
}

/** 删除控制面读取当前ready generation占用；opening/closing返回null。 */
export function projectOccupancy(ref: ProjectWorkspaceRef): ProjectOccupancySnapshot | null {
    const occupancy = globalState.service?.projectOccupancy(ref);
    if (!occupancy) {
        return null;
    }
    return {
        state: occupancy.state,
        userConnections: occupancy.userConnections,
        agentActive: occupancy.agentActive,
    };
}

/** 为当前ready generation取得一路用户presence。 */
export function acquireUserPresence(ref: ProjectWorkspaceRef): () => void {
    const service = globalState.service;
    if (!service) {
        throw new ProjectNotOpenError(ref.projectRoot);
    }
    return service.acquireUserPresence(ref);
}

/** 注册 Agent 在场探针；ready 对象身份确保旧 invocation 不会占用重开的 generation。 */
export function registerAgentPresenceProbe(probe: ((session: ReadyProjectSessionRef) => boolean) | null): void {
    globalState.agentProbe = probe;
    globalState.service?.registerAgentPresenceProbe(probe);
}

/** 仅刷新结构化 Project ref 对应 ready generation 的活动时间；未打开保持no-op。 */
export function markProjectActivity(ref: ProjectWorkspaceRef): void {
    globalState.service?.markProjectActivity(ref);
}

/**
 * 关闭结构化 Project ref 绑定的精确generation。
 * Module或Occupancy关闭失败时Service保留entry，调用方必须处理拒绝，delete不得继续。
 */
export async function closeProject(ref: ProjectWorkspaceRef, reason: ProjectSessionCloseReason): Promise<void> {
    const service = globalState.service;
    if (!service) {
        return;
    }
    await service.closeProject(ref, reason);
    collectReleasedSqliteHandles({force: reason === "delete" || reason === "shutdown"});
}

/** 执行Agent/presence/grace维护，返回本轮完整关闭的 Project roots。 */
export async function sweepProjectSessions(now = Date.now()): Promise<string[]> {
    const service = globalState.service;
    if (!service) {
        return [];
    }
    const closed = await service.sweepProjectSessions(now);
    if (closed.length > 0) {
        collectReleasedSqliteHandles();
    }
    return closed.map((ref) => ref.projectRoot);
}

/** Nitro shutdown/HMR最终关闭唯一Service及其Lifecycle、Module与plain adapter资源。 */
export async function closeAllProjects(): Promise<void> {
    stopMaintenanceTimer();
    const service = globalState.service;
    if (!service) {
        return;
    }
    await service.closeAll();
    if (globalState.service === service) {
        globalState.lifecycle = null;
        globalState.service = null;
        globalState.workspaceRoot = null;
        globalState.compilerRoot = null;
        globalState.compilerContext = null;
    }
    collectReleasedSqliteHandles({force: true});
}

/**
 * 测试专用：仅在测试已经显式close后清空HMR容器与探针。
 * 不执行隐藏async cleanup，避免同步reset制造无人观察的关闭失败。
 */
export function resetProjectSessionsForTest(): void {
    stopMaintenanceTimer();
    globalState.lifecycle = null;
    globalState.service = null;
    globalState.workspaceRoot = null;
    globalState.compilerRoot = null;
    globalState.compilerContext = null;
    globalState.agentProbe = null;
    globalState.sweepInFlight = false;
}

/** 创建或返回绑定同一Runtime Workspace Root与Application Root的HMR稳定Service。 */
function serviceFor(workspaceRoot: AbsoluteFsPath): ProjectSessionService {
    const compilerRoot = runtimePathsFromEnv().applicationRoot;
    if (globalState.service) {
        if (workspaceRootIdentity(globalState.workspaceRoot!) !== workspaceRootIdentity(workspaceRoot)) {
            throw new Error("ProjectSession Service已经绑定到另一个Workspace Root");
        }
        if (workspaceRootIdentity(globalState.compilerRoot!) !== workspaceRootIdentity(compilerRoot)) {
            throw new Error("ProjectSession Service已经绑定到另一个Application Root");
        }
        return globalState.service;
    }
    const lifecycle = new ProjectLifecycle(workspaceRoot);
    const compilerContext = resolveRuntimeArtifactCompilerContext(compilerRoot);
    const service = new ProjectSessionService(workspaceRoot, {
        lifecycle,
        runtime: new ProjectSessionRuntime({compilerContext}),
    });
    service.registerAgentPresenceProbe(globalState.agentProbe);
    globalState.lifecycle = lifecycle;
    globalState.service = service;
    globalState.workspaceRoot = workspaceRoot;
    globalState.compilerRoot = compilerRoot;
    globalState.compilerContext = compilerContext;
    return service;
}
/** 比较单进程Service的Workspace Root绑定，Windows按文件系统大小写语义处理。 */
function workspaceRootIdentity(workspaceRoot: AbsoluteFsPath): string {
    const resolved = path.resolve(workspaceRoot);
    return process.platform === "win32" ? resolved.toLocaleLowerCase("en-US") : resolved;
}

/** 首个ready generation建立后启动唯一维护定时器。 */
function ensureMaintenanceTimer(): void {
    if (globalState.maintenanceTimer) {
        return;
    }
    globalState.maintenanceTimer = setInterval(() => {
        if (globalState.sweepInFlight) {
            return;
        }
        globalState.sweepInFlight = true;
        void sweepProjectSessions()
            .catch(() => undefined)
            .finally(() => {
                globalState.sweepInFlight = false;
            });
    }, MAINTENANCE_INTERVAL_MS);
    globalState.maintenanceTimer.unref?.();
}

/** 停止维护定时器；Service close失败时仍保持shutdown gate，不再执行grace sweep。 */
function stopMaintenanceTimer(): void {
    if (globalState.maintenanceTimer) {
        clearInterval(globalState.maintenanceTimer);
        globalState.maintenanceTimer = null;
    }
}
