import {readdir, rm} from "node:fs/promises";
import {join, relative, resolve, sep} from "node:path";

import {verifyApplicationExecution} from "#manager/application-execution";
import {removeDockerDeployment, stopDocker} from "#manager/docker";
import {assertNativeProductStopped} from "#manager/health";
import {mutateInstallation, mutateUninstallation} from "#manager/installation-mutation";
import {resolveInstallationRoots} from "#manager/root-locators";
import {
    requiresWindowsUninstallHost,
    scheduleWindowsUninstall,
    type WindowsUninstallIntent,
    type WindowsUninstallLayout,
} from "#manager/windows-uninstall-host";

type CompletedUninstall = {
    status: "completed";
    installationRoot: string;
    stateRoot: string;
    statePreserved: boolean;
};

type ScheduledUninstall = {
    status: "scheduled";
    installationRoot: string;
    stateRoot: string;
    statePreserved: boolean;
    resultPath: string;
};

export type UninstallResult = CompletedUninstall | ScheduledUninstall;

/**
 * 删除受管安装拥有的程序、缓存和桌面本地状态。
 *
 * 默认保留 State Root，但会删除其中不属于内容备份的 logs。Portable 的 State Root
 * 位于 Installation Root 内，因此默认卸载会留下承载 data 的目录外壳。停止检查与
 * 所有权删除在同一个外置 lease 内开始，调用方不能绕过恢复、身份和运行状态门禁。
 */
export async function uninstallInstallation(options: {
    installationRoot: string;
    deleteData?: boolean;
}): Promise<UninstallResult> {
    const installationRoot = resolve(options.installationRoot);
    let result: UninstallResult | undefined;
    await mutateUninstallation(installationRoot, async (mutation) => {
        const roots = resolveInstallationRoots(mutation.root, mutation.manifest.roots);
        const deleteData = options.deleteData ?? false;
        const layout: WindowsUninstallLayout = Object.values(mutation.manifest.roots)
            .some((locator) => locator.base === "local-app-data")
            ? "installed-windows"
            : "installation-scoped";
        if (mutation.pendingUninstall) {
            assertPendingRequest(mutation.pendingUninstall, {
                root: mutation.root,
                layout,
                stateRoot: roots.state,
                cacheRoot: roots.cache,
                desktopRoot: roots.desktop,
                deleteData,
            });
        }
        const product = mutation.manifest.components.product;
        if (product?.provider === "container") {
            const execution = await verifyApplicationExecution(mutation.root, mutation.manifest);
            if (execution.kind !== "container-product") {
                throw new Error("Container 卸载缺少已验证的容器执行身份。");
            }
            await stopDocker(execution.engine, mutation.root, roots.state);
            await removeDockerDeployment(execution.engine, mutation.root, roots.state);
        } else {
            await assertNativeProductStopped(roots.state);
        }
        if (requiresWindowsUninstallHost(mutation.root)) {
            const scheduled = await scheduleWindowsUninstall({
                root: mutation.root,
                layout,
                stateRoot: roots.state,
                cacheRoot: roots.cache,
                desktopRoot: roots.desktop,
                deleteData,
                intent: mutation.pendingUninstall ?? undefined,
            });
            result = {
                status: "scheduled",
                installationRoot: mutation.root,
                stateRoot: roots.state,
                statePreserved: !deleteData,
                resultPath: scheduled.resultPath,
            };
            return;
        }
        if (deleteData) {
            for (const target of topLevelRoots([roots.state, roots.cache, roots.desktop])) {
                await rm(target, {recursive: true, force: true});
            }
            await rm(mutation.root, {recursive: true, force: true});
            result = {status: "completed", installationRoot: mutation.root, stateRoot: roots.state, statePreserved: false};
            return;
        }

        await rm(roots.cache, {recursive: true, force: true});
        await rm(roots.desktop, {recursive: true, force: true});
        await rm(resolve(roots.state, "logs"), {recursive: true, force: true});

        if (isSameOrWithin(mutation.root, roots.state)) {
            await removeTreeExcept(mutation.root, [roots.state]);
        } else {
            await rm(mutation.root, {recursive: true, force: true});
        }
        result = {status: "completed", installationRoot: mutation.root, stateRoot: roots.state, statePreserved: true};
    });
    if (!result) throw new Error("卸载事务没有生成结果。");
    return result;
}

/** pending intent 是不可变删除决定；重试不能扩大数据删除范围或更换 owner root。 */
function assertPendingRequest(intent: WindowsUninstallIntent, request: {
    root: string;
    layout: WindowsUninstallLayout;
    stateRoot: string;
    cacheRoot: string;
    desktopRoot: string;
    deleteData: boolean;
}): void {
    if (
        intent.layout !== request.layout
        || !samePath(intent.installationRoot, request.root)
        || !samePath(intent.stateRoot, request.stateRoot)
        || !samePath(intent.cacheRoot, request.cacheRoot)
        || !samePath(intent.desktopRoot, request.desktopRoot)
        || intent.deleteData !== request.deleteData
    ) {
        throw new Error("待完成的 Windows uninstall intent 与当前安装或删除范围不一致。" );
    }
}

/** 在 InstallationMutation 内恢复、重读、停止并删除 Desktop Local Root。 */
export async function resetDesktopLocalState(options: {
    installationRoot: string;
}): Promise<string> {
    const installationRoot = resolve(options.installationRoot);
    return mutateInstallation(installationRoot, async (mutation) => {
        const roots = resolveInstallationRoots(mutation.root, mutation.manifest.roots);
        const product = mutation.manifest.components.product;
        if (product?.provider === "container") {
            const execution = await verifyApplicationExecution(mutation.root, mutation.manifest);
            if (execution.kind !== "container-product") {
                throw new Error("Container 桌面重置缺少已验证的容器执行身份。");
            }
            await stopDocker(execution.engine, mutation.root, roots.state);
        } else {
            await assertNativeProductStopped(roots.state);
        }
        await rm(roots.desktop, {recursive: true, force: true});
        return roots.desktop;
    });
}

/** 删除目录树中除 preserve roots 及其祖先路径外的所有节点。 */
async function removeTreeExcept(currentRoot: string, preserveRoots: string[]): Promise<void> {
    if (preserveRoots.some((root) => samePath(currentRoot, root))) return;
    const entries = await readdir(currentRoot, {withFileTypes: true}).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
    });
    for (const entry of entries) {
        const target = resolve(currentRoot, entry.name);
        if (preserveRoots.some((root) => samePath(target, root))) continue;
        const nestedRoots = preserveRoots.filter((root) => isSameOrWithin(target, root));
        if (nestedRoots.length > 0) {
            await removeTreeExcept(target, nestedRoots);
            continue;
        }
        await rm(target, {recursive: true, force: true});
    }
}

/** 去除被其他待删 root 包含的子 root，避免并发或重复删除产生所有权歧义。 */
function topLevelRoots(roots: string[]): string[] {
    const unique = [...new Set(roots.map((root) => resolve(root)))];
    return unique.filter((candidate) => !unique.some((other) => (
        !samePath(candidate, other) && isSameOrWithin(other, candidate)
    )));
}

function isSameOrWithin(root: string, target: string): boolean {
    const path = relative(resolve(root), resolve(target));
    return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !path.startsWith(sep));
}

function samePath(left: string, right: string): boolean {
    const normalizedLeft = resolve(left);
    const normalizedRight = resolve(right);
    return process.platform === "win32"
        ? normalizedLeft.toLocaleLowerCase("en-US") === normalizedRight.toLocaleLowerCase("en-US")
        : normalizedLeft === normalizedRight;
}
