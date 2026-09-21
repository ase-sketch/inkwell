import {resolve} from "node:path";

import {blessedStatic as blessed} from "#manager/blessed-static";
import {runInstallGuide} from "#manager/install-guide";
import {configuredDiscoveryRoots, discoverInstances} from "#manager/instance-discovery";
import {importInstallation, inspectImport} from "#manager/instance-import";
import {
    forgetManagerInstance,
    readManagerConfig,
    registerManagerInstance,
    setDefaultManagerInstance,
} from "#manager/manager-config";
import {doctor, installationStatus} from "#manager/maintenance";
import {readInstallationManifest} from "#manager/manifest-store";
import {installationPaths} from "#manager/paths";
import {startInstallationApplication} from "#manager/migration-operation";
import type {DoctorReport, InstallationStatus, ManagerConfig, ManagerInstance, OfflineInspection} from "#manager/types";
import type {InstallationManifest} from "@notnotype/neuro-book-contracts/installation";
import {updateInstallation} from "#manager/updater";
import {adoptSourceInstallation, assertAdoptionPreflight, inspectAdoptionPreflight, type AdoptionProfile} from "#manager/source-adoption";

type InstanceView = {
    instance: ManagerInstance;
    manifest: InstallationManifest | null;
};
type ManagerListItem = {kind: "registered"; view: InstanceView} | {kind: "discovered"; inspection: OfflineInspection};

/** 打开 blessed 实例管理界面；长时间运行的安装、更新和启动会退出 TUI 后继续。 */
export async function runManagerTui(managerExecutable: string): Promise<void> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error("NeuroBook Manager TUI 需要交互终端。" );
    }
    const screen = blessed.screen({
        smartCSR: true,
        fullUnicode: true,
        title: "NeuroBook Manager",
    });
    const header = blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: "100%",
        height: 3,
        tags: true,
        content: " {bold}NeuroBook Manager{/bold}  实例管理",
        style: {fg: "white", bg: "blue"},
    });
    const list = blessed.list({
        parent: screen,
        label: " 实例 ",
        top: 3,
        left: 0,
        width: "38%",
        bottom: 3,
        border: "line",
        keys: true,
        vi: true,
        mouse: true,
        tags: true,
        scrollbar: {ch: " ", track: {bg: "gray"}, style: {bg: "cyan"}},
        style: {
            selected: {bg: "cyan", fg: "black", bold: true},
            border: {fg: "blue"},
        },
    });
    const detail = blessed.box({
        parent: screen,
        label: " 状态 ",
        top: 3,
        left: "38%",
        right: 0,
        bottom: 3,
        border: "line",
        tags: true,
        scrollable: true,
        alwaysScroll: true,
        keys: true,
        vi: true,
        mouse: true,
        padding: {left: 1, right: 1},
        style: {border: {fg: "blue"}, label: {fg: "cyan"}},
    });
    blessed.box({
        parent: screen,
        left: 0,
        bottom: 0,
        width: "100%",
        height: 3,
        tags: true,
        content: " ↑↓ 选择  Enter 状态  d 诊断  s 启动  u 更新  i 导入  o 接管  n 新安装  a 路径导入  f 默认  x 忘记  r 刷新发现  q 退出",
        style: {fg: "black", bg: "white"},
    });
    const question = blessed.question({
        parent: screen,
        border: "line",
        width: "70%",
        height: 7,
        top: "center",
        left: "center",
        keys: true,
        vi: true,
        tags: true,
        label: " 确认 ",
    });
    const prompt = blessed.prompt({
        parent: screen,
        border: "line",
        width: "75%",
        height: 8,
        top: "center",
        left: "center",
        keys: true,
        vi: true,
        label: " 注册实例 ",
    });

    let config: ManagerConfig = await readManagerConfig();
    let views: InstanceView[] = [];
    let discovered: OfflineInspection[] = [];
    let items: ManagerListItem[] = [];
    let busy = false;
    let selectedIndex = 0;

    /** 重新读取配置和各实例 manifest，并保持当前选择。 */
    const refresh = async (): Promise<void> => {
        const selectedId = views[selectedIndex]?.instance.id;
        config = await readManagerConfig();
        const discovery = await discoverInstances(configuredDiscoveryRoots(config), config.instances.map((instance) => instance.root));
        discovered = discovery.candidates;
        header.setContent(` {bold}NeuroBook Manager{/bold}  实例管理  {gray-fg}${config.instances.length} 个实例 · ${discovered.length} 个待接管{/gray-fg}`);
        views = await Promise.all(config.instances.map(async (instance) => ({
            instance,
            manifest: await readInstallationManifest(installationPaths(instance.root).manifest),
        })));
        items = [...views.map((view): ManagerListItem => ({kind: "registered", view})), ...discovered.map((inspection): ManagerListItem => ({kind: "discovered", inspection}))];
        list.setItems(items.map((item) => item.kind === "registered" ? instanceLabel(item.view, config.defaultInstanceId) : discoveredLabel(item.inspection)));
        selectedIndex = Math.max(0, items.findIndex((item) => item.kind === "registered" && item.view.instance.id === selectedId));
        if (views.length) list.select(selectedIndex);
        detail.setContent(items.length ? formatListItem(items[selectedIndex] ?? items[0]!, config.defaultInstanceId) : "尚未注册或发现实例。\n\n按 n 运行安装向导，或按 a 输入已有Installation Root。");
        screen.render();
    };

    /** 串行执行 TUI 动作，避免按键重复触发部署操作。 */
    const runAction = async (action: () => Promise<void>): Promise<void> => {
        if (busy) return;
        busy = true;
        try {
            await action();
        } catch (error) {
            detail.setContent(`{red-fg}操作失败{/red-fg}\n\n${error instanceof Error ? error.message : String(error)}`);
            screen.render();
        } finally {
            busy = false;
        }
    };

    /** 返回当前选中且 manifest 可读取的实例。 */
    const selected = (): {instance: ManagerInstance; manifest: InstallationManifest} => {
        const item = items[selectedIndex];
        if (!item || item.kind !== "registered") throw new Error("当前选择是待导入/接管候选，不支持该动作。" );
        const view = item.view;
        if (!view.manifest) throw new Error(`实例目录不存在或 installation.json 无效：${view.instance.root}`);
        return {instance: view.instance, manifest: view.manifest};
    };

    list.on("select", (_item, index) => {
        selectedIndex = index;
        const item = items[index];
        if (item) detail.setContent(formatListItem(item, config.defaultInstanceId));
        screen.render();
    });
    list.key("enter", () => void runAction(async () => {
        const target = selected();
        detail.setContent("正在读取实例状态……");
        screen.render();
        detail.setContent(formatStatus(await installationStatus(target.instance.root, target.manifest)));
        screen.render();
    }));
    screen.key("d", () => void runAction(async () => {
        const target = selected();
        detail.setContent("正在执行诊断……");
        screen.render();
        detail.setContent(formatDoctor(await doctor(target.instance.root, target.manifest)));
        screen.render();
    }));
    screen.key("s", () => void runAction(async () => {
        const target = selected();
        screen.destroy();
        await startInstallationApplication(target.instance.root);
    }));
    screen.key("u", () => void runAction(async () => {
        const target = selected();
        question.ask(`更新 ${target.instance.name}（${target.manifest.appVersion}）？`, (_error, confirmed) => {
            if (!confirmed) return;
            screen.destroy();
            void updateInstallation({
                root: target.instance.root,
                manifest: target.manifest,
                managerExecutable,
            }).then((result) => console.log(result.changed
                ? `更新完成：${result.manifest.appVersion}`
                : `已是最新版本：${result.manifest.appVersion}`)).catch((error: unknown) => {
                console.error(error instanceof Error ? error.message : String(error));
                process.exitCode = 1;
            });
        });
    }));
    screen.key("n", () => {
        screen.destroy();
        void runInstallGuide({managerExecutable}).catch((error: unknown) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        });
    });
    screen.key("a", () => {
        prompt.input("输入已有 NeuroBook Installation Root", process.cwd(), (_error, value) => {
            if (!value?.trim()) return;
            void runAction(async () => {
                await importInstallation({root: resolve(value.trim()), makeDefault: config.instances.length === 0, acceptWarnings: true});
                await refresh();
            });
        });
    });
    screen.key("i", () => void runAction(async () => {
        const item = items[selectedIndex];
        if (!item || item.kind !== "discovered" || item.inspection.kind !== "managed-installation") throw new Error("请选择一个可导入的Manifest实例。" );
        const inspection = await inspectImport(item.inspection.root);
        if (!inspection.importable) throw new Error(inspection.blockers.map((issue) => issue.message).join("\n"));
        question.ask(`离线检查通过，包含${inspection.warnings.length}项运行状态提示。继续导入？`, (_error, confirmed) => {
            if (!confirmed) return;
            void runAction(async () => {
                await importInstallation({root: item.inspection.root, makeDefault: config.instances.length === 0, acceptWarnings: true});
                await refresh();
            });
        });
    }));
    screen.key("o", () => void runAction(async () => {
        const item = items[selectedIndex];
        if (!item || item.kind !== "discovered" || item.inspection.kind !== "neuro-book-checkout") throw new Error("请选择一个可接管的NeuroBook checkout。" );
        prompt.input("接管Profile（source-dev/source-product/source-docker）", "source-dev", (_error, value) => {
            if (!value?.trim()) return;
            void runAction(async () => {
                const profile = adoptionProfile(value);
                const preflight = await inspectAdoptionPreflight({root: item.inspection.root, profile, port: 3000});
                assertAdoptionPreflight(preflight);
                await adoptSourceInstallation({root: item.inspection.root, profile, channel: config.preferences.channel, port: 3000, authEnabled: true, dryRun: false, managerExecutable}, preflight);
                await refresh();
            });
        });
    }));
    screen.key("r", () => void runAction(refresh));
    screen.key("f", () => void runAction(async () => {
        const target = selected();
        await setDefaultManagerInstance(target.instance.id);
        await refresh();
    }));
    screen.key("x", () => void runAction(async () => {
        const target = selected();
        question.ask(`只从 Manager 列表中忘记 ${target.instance.name}？实例文件不会被删除。`, (_error, confirmed) => {
            if (!confirmed) return;
            void runAction(async () => {
                await forgetManagerInstance(target.instance.id);
                await refresh();
            });
        });
    }));
    screen.key(["q", "C-c"], () => {
        screen.destroy();
    });

    await refresh();
    list.focus();
    screen.render();
}

function adoptionProfile(value: string): AdoptionProfile {
    const normalized = value.trim();
    if (normalized === "source-dev" || normalized === "source-product" || normalized === "source-docker") return normalized;
    throw new Error(`接管Profile无效：${value}`);
}

/** 渲染左侧实例列表中的单行摘要。 */
function instanceLabel(view: InstanceView, defaultInstanceId: string | null): string {
    const marker = view.instance.id === defaultInstanceId ? "{green-fg}●{/green-fg}" : "○";
    const version = view.manifest ? `${view.manifest.profile} · ${view.manifest.appVersion}` : "{red-fg}不可用{/red-fg}";
    return `${marker} ${view.instance.name}  {gray-fg}${version}{/gray-fg}`;
}

function discoveredLabel(inspection: OfflineInspection): string {
    const label = inspection.kind === "managed-installation" ? "待导入" : inspection.kind === "neuro-book-checkout" ? "待接管" : "需处理";
    return `{yellow-fg}◇{/yellow-fg} ${inspection.root}  {gray-fg}${label}{/gray-fg}`;
}

function formatListItem(item: ManagerListItem, defaultInstanceId: string | null): string {
    if (item.kind === "registered") return formatInstance(item.view, defaultInstanceId);
    const inspection = item.inspection;
    return [`{bold}${inspection.root}{/bold}`, "", `类型：${inspection.kind}`, `Product：${inspection.product.exists ? inspection.product.trusted ? "可信" : "存在但不可信" : "不存在"}`, ...inspection.blockers.map((issue) => `{red-fg}阻断{/red-fg}：${issue.message}`), ...inspection.warnings.map((issue) => `{yellow-fg}警告{/yellow-fg}：${issue.message}`), "", inspection.kind === "managed-installation" ? "按 i 导入。" : inspection.kind === "neuro-book-checkout" ? "按 o 以Source Dev接管。" : "请按提示人工处理。"].join("\n");
}

/** 渲染未执行外部检查时的实例基础详情。 */
function formatInstance(view: InstanceView, defaultInstanceId: string | null): string {
    if (!view.manifest) {
        return `{bold}${view.instance.name}{/bold}\n\n{red-fg}实例不可用{/red-fg}\n${view.instance.root}\n\n可按 x 忘记此记录，或修复目录后重新进入 TUI。`;
    }
    return [
        `{bold}${view.instance.name}{/bold}${view.instance.id === defaultInstanceId ? "  {green-fg}[默认]{/green-fg}" : ""}`,
        "",
        `目录：${view.instance.root}`,
        `Profile：${view.manifest.profile}`,
        `应用版本：${view.manifest.appVersion}`,
        `Manager：${view.manifest.managerVersion}`,
        `更新通道：${view.manifest.channel}`,
        `State Root：${installationPaths(view.instance.root, view.manifest.roots).state}`,
        "",
        "按 Enter 刷新完整状态，按 d 执行诊断。",
    ].join("\n");
}

/** 将结构化 status 转成用户可读摘要。 */
function formatStatus(status: InstallationStatus): string {
    return [
        "{bold}实例状态{/bold}", "",
        `Profile：${status.profile}`,
        `应用：${status.appVersion}`,
        `Manager：${status.managerVersion}`,
        `端口：${status.port}`,
        `Product：${status.productReady ? "{green-fg}就绪{/green-fg}" : "{red-fg}缺失{/red-fg}"}`,
        `服务：${status.service.status}（${status.service.message}）`,
        `待恢复操作：${status.unfinishedOperations.length}`,
        "", "下一步：", ...status.nextActions.map((action) => `- ${action}`),
    ].join("\n");
}

/** 将结构化 doctor checks 转成用户可读列表。 */
function formatDoctor(result: DoctorReport): string {
    const lines = [`{bold}诊断结果：${result.healthy ? "{green-fg}健康{/green-fg}" : "{red-fg}需要处理{/red-fg}"}{/bold}`, ""];
    for (const check of result.checks) {
        const marker = check.status === "pass" ? "{green-fg}✓{/green-fg}" : check.status === "warn" ? "{yellow-fg}!{/yellow-fg}" : "{red-fg}✗{/red-fg}";
        lines.push(`${marker} ${check.message}`);
        if (check.remediation) lines.push(`  建议：${check.remediation}`);
    }
    return lines.join("\n");
}
