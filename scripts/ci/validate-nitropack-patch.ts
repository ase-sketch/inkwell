#!/usr/bin/env bun
import {execFile} from "node:child_process";
import {readdir, readFile, realpath} from "node:fs/promises";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const patchedModules = [
    join("dist", "runtime", "internal", "error", "dev.mjs"),
    join("dist", "core", "index.mjs"),
    join("dist", "rollup", "index.mjs"),
];
const publicMtime = "mtime: process.env.SOURCE_DATE_EPOCH === void 0 ? stat.mtime.toJSON() : void 0";
const serverMtime = "const mtime = process.env.SOURCE_DATE_EPOCH === void 0 ? await promises.stat(fsPath).then((s) => s.mtime.toJSON()) : void 0;";
const stableOrder = "Object.entries(assets).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)";

/** 在补丁或安装产物违反可执行合同时终止校验。 */
function ensure(condition: boolean, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

/** 校验补丁坐标，以及顶层和 Nuxt 实际引用的 Nitro 安装产物。 */
export async function validateNitropackPatch(root = repositoryRoot): Promise<void> {
    const patch = await readFile(resolve(root, "patches", "nitropack@2.13.4.patch"), "utf8");
    ensure(
        patch.includes("@@ -1280,7 +1280,10 @@ function publicAssets(nitro) {"),
        "Nitro publicAssets 排序 hunk 坐标错误",
    );
    ensure(
        patch.includes("@@ -1496,7 +1499,7 @@ function serverAssets(nitro) {"),
        "Nitro serverAssets mtime hunk 未累计前序新增行",
    );

    const packageRoots = new Set<string>();
    const topLevelPackage = resolve(root, "node_modules", "nitropack");
    try {
        packageRoots.add(await realpath(topLevelPackage));
    } catch {
        // Bun Linux 安装可能只保留被 Nuxt 依赖链接到的 .bun 包副本。
    }
    const bunPackageStore = resolve(root, "node_modules", ".bun");
    let bunPackageNames: string[] = [];
    try {
        bunPackageNames = await readdir(bunPackageStore);
    } catch (error) {
        if (!isMissingPath(error)) throw error;
    }
    for (const name of bunPackageNames) {
        if (name.startsWith("@nuxt+nitro-server@")) {
            packageRoots.add(await realpath(join(bunPackageStore, name, "node_modules", "nitropack")));
        }
    }
    ensure(packageRoots.size > 0, "未找到 Nuxt 实际使用的 nitropack 安装产物");

    for (const packageRoot of packageRoots) {
        for (const modulePath of patchedModules) {
            const path = join(packageRoot, modulePath);
            const result = await execFileAsync("node", ["--check", path]);
            ensure(result.stderr === "", `Node 语法检查产生错误输出: ${path}\n${result.stderr}`);
        }

        const core = (await readFile(join(packageRoot, "dist", "core", "index.mjs"), "utf8")).replaceAll("\r\n", "\n");
        ensure(core.includes("const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;"), `Nitro buildDate 补丁缺失: ${packageRoot}`);
        ensure((core.match(/date: buildDate\(\)/gu) ?? []).length === 2, `Nitro buildDate 调用数量错误: ${packageRoot}`);

        const rollup = (await readFile(join(packageRoot, "dist", "rollup", "index.mjs"), "utf8")).replaceAll("\r\n", "\n");
        ensure(rollup.includes(publicMtime), `Nitro public asset mtime 补丁缺失: ${packageRoot}`);
        ensure(rollup.includes(serverMtime), `Nitro server asset mtime 补丁缺失: ${packageRoot}`);
        ensure(rollup.includes(stableOrder), `Nitro public asset 稳定排序补丁缺失: ${packageRoot}`);
        ensure((rollup.match(/JSON\.stringify\(sortedAssets, null, 2\)/gu) ?? []).length === 1, `Nitro 排序序列化数量错误: ${packageRoot}`);
        ensure(!rollup.includes("JSON.stringify(assets, null, 2)"), `Nitro 仍包含未排序序列化: ${packageRoot}`);
        ensure(rollup.includes(`if (type.startsWith("text")) {
              type += "; charset=utf-8";
            }
            const etag = createEtag(await promises.readFile(fsPath));
            ${serverMtime}
            assets[id].meta = { type, etag, mtime };`), `Nitro server asset mtime 作用域错误: ${packageRoot}`);
    }

    console.log(`Nitro 补丁校验通过：${packageRoots.size} 份安装产物。`);
}

/** 判断可选 Bun package store 是否不存在。 */
function isMissingPath(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

if (import.meta.main) {
    await validateNitropackPatch();
}
