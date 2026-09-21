/**
 * 判断模块源码是否包含 Source Root 下的绝对后代路径。
 *
 * Source Root 本身可能同时是合法的运行时 Application Root，例如容器中的 `/app`；
 * 只有继续指向该根下文件或目录的路径才构成构建机路径泄漏。
 */
export function containsSourceRootDescendant(source: string, sourceRoot: string): boolean {
    const normalizedSource = source.toLowerCase();
    const slashRoot = sourceRoot.replaceAll("\\", "/");
    const backslashRoot = sourceRoot.replaceAll("/", "\\");
    const variants = [...new Set([
        sourceRoot,
        slashRoot,
        backslashRoot,
        backslashRoot.replaceAll("\\", "\\\\"),
    ].filter((root) => root.length > 0).map((root) => root.toLowerCase()))];
    const segmentCharacter = /[a-z0-9_.$@~-]/u;

    for (const root of variants) {
        let offset = normalizedSource.indexOf(root);
        while (offset >= 0) {
            const before = offset === 0 ? undefined : normalizedSource[offset - 1];
            const after = normalizedSource[offset + root.length];
            if ((!before || !segmentCharacter.test(before)) && (after === "/" || after === "\\")) {
                return true;
            }
            offset = normalizedSource.indexOf(root, offset + 1);
        }
    }
    return false;
}
