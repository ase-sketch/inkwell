#!/usr/bin/env bun
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const PACKAGE_NAME = "proper-lockfile";
const PACKAGE_VERSION = "4.1.2";
const PATCH_RELATIVE_PATH = "patches/proper-lockfile@4.1.2.patch";
const PATCHED_FILES = ["lib/lockfile.js", "lib/mtime-precision.js"] as const;

function ensure(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

/** 校验精确补丁登记、上游载荷和安装后的关键行为源码。 */
export async function validateProperLockfilePatch(root = repositoryRoot): Promise<void> {
    const projectRoot = resolve(root);
    const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8")) as {
        dependencies?: Record<string, string>;
        patchedDependencies?: Record<string, string>;
    };
    ensure(packageJson.dependencies?.[PACKAGE_NAME] === PACKAGE_VERSION, "proper-lockfile 依赖未固定为 4.1.2");
    ensure(
        packageJson.patchedDependencies?.[`${PACKAGE_NAME}@${PACKAGE_VERSION}`] === PATCH_RELATIVE_PATH,
        "proper-lockfile 精确 patch 登记缺失或路径错误",
    );

    const lockfileText = await readFile(resolve(projectRoot, "bun.lock"), "utf8");
    ensure(
        /"proper-lockfile@4\.1\.2":\s+"patches\/proper-lockfile@4\.1\.2\.patch",/u.test(lockfileText),
        "bun.lock 缺少 proper-lockfile 精确 patch 映射",
    );

    const patch = await readFile(resolve(projectRoot, PATCH_RELATIVE_PATH), "utf8");
    for (const path of PATCHED_FILES) {
        ensure(patch.includes(`diff --git a/${path} b/${path}`), `patch 缺少上游文件：${path}`);
    }
    ensure(patch.includes("index 97b66373d5c5057de38884bb870ee68134e5a7ee"), "lockfile.js 上游坐标不匹配");
    ensure(patch.includes("index b82a3ce01c933ad6df96e03cda90156ce62faf64"), "mtime-precision.js 上游坐标不匹配");
    ensure(patch.includes("const PRECISIONS = [1, 1000, 2000];"), "补丁未登记支持的 mtime 精度候选");
    ensure(patch.includes("precisionUnsupported: true"), "补丁未登记精度探测失败标记");
    ensure(!patch.includes(".bun-tag-"), "补丁包含安装器元数据");

    const installedPackageRoot = resolve(projectRoot, "node_modules", PACKAGE_NAME);
    const installedPackage = JSON.parse(await readFile(resolve(installedPackageRoot, "package.json"), "utf8")) as {version?: string};
    ensure(installedPackage.version === PACKAGE_VERSION, `安装产物版本错误：${installedPackage.version ?? "missing"}`);

    const installedMtime = await readFile(resolve(installedPackageRoot, "lib", "mtime-precision.js"), "utf8");
    const installedLockfile = await readFile(resolve(installedPackageRoot, "lib", "lockfile.js"), "utf8");
    ensure(installedMtime.includes("const PRECISIONS = [1, 1000, 2000];"), "安装产物未包含 mtime 精度补丁");
    ensure(installedMtime.includes("precisionUnsupported: true"), "安装产物未包含精度失败标记");
    ensure(installedLockfile.includes("if (err && err.precisionUnsupported)"), "安装产物未包含精度错误终止分支");

    console.log(`proper-lockfile patch 校验通过：${installedPackageRoot}`);
}

if (import.meta.main) await validateProperLockfilePatch();
