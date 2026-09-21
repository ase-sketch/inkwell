import {existsSync} from "node:fs";
import {readdir, rm} from "node:fs/promises";
import {join} from "node:path";

const TEST_DIRECTORY_NAMES = new Set(["__tests__", "test", "tests", "test-utils", "test-helpers"]);
const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/iu;
const TEST_HELPER_FILE_PATTERN = /(?:^|[.-])test-(?:utils?|helpers?)\.[cm]?[jt]sx?$/iu;

/**
 * 从Product运行源码副本中删除测试文件和测试专用目录。
 *
 * Source archive仍保留完整Git tracked源码；本函数只用于`.output` vendor和本地
 * Product staging，避免运行包携带测试代码或被外层测试发现器重复执行。
 */
export async function pruneRuntimeTestSources(root) {
    if (!existsSync(root)) {
        return;
    }
    await pruneDirectory(root);
}

/** 判断相对运行源码路径是否属于测试文件或测试专用目录。 */
export function isRuntimeTestSourcePath(path) {
    const segments = path.replaceAll("\\", "/").split("/").filter(Boolean);
    const fileName = segments.at(-1) ?? "";
    return segments.some((segment) => TEST_DIRECTORY_NAMES.has(segment))
        || TEST_FILE_PATTERN.test(fileName)
        || TEST_HELPER_FILE_PATTERN.test(fileName);
}

/** 递归删除当前运行源码树中的测试条目。 */
async function pruneDirectory(root) {
    for (const entry of await readdir(root, {withFileTypes: true})) {
        const target = join(root, entry.name);
        if (entry.isDirectory()) {
            if (isRuntimeTestSourcePath(entry.name)) {
                await rm(target, {recursive: true, force: true});
                continue;
            }
            await pruneDirectory(target);
            continue;
        }
        if (entry.isFile() && isRuntimeTestSourcePath(entry.name)) {
            await rm(target, {force: true});
        }
    }
}
