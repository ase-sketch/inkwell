import {readFile} from "node:fs/promises";
import {isAbsolute, relative, resolve, sep} from "node:path";

type StateRootManifestShape = {
    roots?: {
        state?: {
            base?: string;
            path?: string;
        };
    };
};

/**
 * 从公开GHCR smoke读取的Installation Manifest解析State Root。
 *
 * 该smoke只支持installation-scoped容器安装；其他base必须失败，不能猜测宿主目录。
 */
export function resolveReleaseStateRoot(root: string, document: unknown): string {
    // document来自外部JSON，只在完成最小结构与路径门禁后读取。
    const manifest = document && typeof document === "object" ? document as StateRootManifestShape : undefined;
    const locator = manifest?.roots?.state;
    const rawPath = locator?.path;
    const segments = rawPath?.replaceAll("\\", "/").split("/") ?? [];
    if (locator?.base !== "installation-root"
        || typeof rawPath !== "string"
        || !rawPath
        || isAbsolute(rawPath)
        || /^[A-Za-z]:/u.test(rawPath)
        || segments.some((segment) => !segment || segment === "." || segment === "..")) {
        throw new Error("公开GHCR smoke无法安全解析Installation Manifest的State Root locator。");
    }
    const installationRoot = resolve(root);
    const stateRoot = resolve(installationRoot, rawPath);
    const stateRelative = relative(installationRoot, stateRoot);
    if (!stateRelative || stateRelative === ".." || stateRelative.startsWith(`..${sep}`) || isAbsolute(stateRelative)) {
        throw new Error("公开GHCR smoke的State Root locator越过Installation Root。");
    }
    return stateRoot;
}

/** 输出Release shell消费的唯一State Root路径。 */
async function main(): Promise<void> {
    const [root] = process.argv.slice(2);
    if (!root) throw new Error("用法：bun installation-state-root.ts <installation-root>");
    const manifestPath = resolve(root, ".deploy", "installation.json");
    const document: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
    process.stdout.write(resolveReleaseStateRoot(root, document));
}

if (import.meta.main) await main();
