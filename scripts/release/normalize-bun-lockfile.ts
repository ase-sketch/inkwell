/** 将 Bun 在 Windows 生成的 file: 路径恢复为跨平台 POSIX 描述符。 */
export function normalizeBunLockfileWorkspaceFileSpecifiers(lockfile: string): string {
    return lockfile.replace(/file:[^"\r\n]*/gu, (specifier) => specifier.replace(/\\+/gu, "/"));
}
