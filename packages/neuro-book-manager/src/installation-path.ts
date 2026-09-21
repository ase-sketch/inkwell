import path from "node:path";

/** 只能定位 Installation Root 内部非根目录项的 canonical 相对路径。 */
declare const installationRelativePathBrand: unique symbol;
export type InstallationRelativePath = string & {readonly [installationRelativePathBrand]: "installation-relative-path"};

/**
 * 校验并规范化 Installation-relative path。
 *
 * 该类型会进入递归删除、回滚和提交后清理，因而不接受 root 本身、空 segment、
 * dot segment、盘符、UNC 或任何绝对路径。
 */
export function installationRelativePath(input: string): InstallationRelativePath {
    const normalized = input.replaceAll("\\", "/");
    const segments = normalized.split("/");
    if (!normalized
        || normalized === "."
        || normalized.startsWith("/")
        || normalized.startsWith("//")
        || /^[A-Za-z]:/u.test(normalized)
        || path.isAbsolute(input)
        || segments.some((segment) => !segment || segment === "." || segment === "..")) {
        throw new Error(`路径必须是 Installation Root 内的非根目录项：${input}`);
    }
    return normalized as InstallationRelativePath;
}

/** 将严格相对路径解析成 Installation Root 内的物理目标。 */
export function installationTarget(root: string, input: string): string {
    const relativePath = installationRelativePath(input);
    const normalizedRoot = path.resolve(root);
    const target = path.resolve(normalizedRoot, relativePath);
    const relativeTarget = path.relative(normalizedRoot, target);
    if (isOutsideRoot(relativeTarget) || !relativeTarget) {
        throw new Error(`路径越过 Installation Root：${input}`);
    }
    return target;
}

/** 校验一个绝对事务路径属于指定根；可选择是否允许根本身。 */
export function assertAbsolutePathWithin(
    root: string,
    target: string,
    label: string,
    options: {allowRoot?: boolean} = {},
): string {
    if (!path.isAbsolute(target)) {
        throw new Error(`${label}必须是绝对路径：${target}`);
    }
    const normalizedRoot = path.resolve(root);
    const normalizedTarget = path.resolve(target);
    const relativeTarget = path.relative(normalizedRoot, normalizedTarget);
    if (isOutsideRoot(relativeTarget) || (!options.allowRoot && !relativeTarget)) {
        throw new Error(`${label}越过允许根目录：${target}`);
    }
    return normalizedTarget;
}

function isOutsideRoot(relativePath: string): boolean {
    return path.isAbsolute(relativePath)
        || relativePath === ".."
        || relativePath.startsWith(`..${path.sep}`);
}
