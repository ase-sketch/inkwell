// 备份归档的纯规则层（Task 112 spec §9.4）：排除规则与 zip 条目名安全化。
// 抽成纯函数便于直接单测，也让打包/恢复两侧共享同一判据。

/**
 * 打包排除规则：secrets/、logs/ 整目录、锁文件、临时文件、SQLite wal/shm 伴生文件。
 * relativePath 以 State Root 为基准、使用 / 分隔。
 */
export function shouldExcludeFromBackup(relativePath: string): boolean {
    const normalized = relativePath.replaceAll("\\", "/");
    if (normalized === "secrets" || normalized.startsWith("secrets/")
        || normalized === "logs" || normalized.startsWith("logs/")) {
        return true;
    }
    const name = normalized.split("/").pop() ?? "";
    return name.endsWith(".lock") || name.endsWith(".tmp") || name.endsWith("-wal") || name.endsWith("-shm");
}

/**
 * SQLite 数据库判定：这类文件不能直接拷贝活文件，打包时走 VACUUM INTO 冷快照。
 */
export function isSqliteFile(relativePath: string): boolean {
    return relativePath.replaceAll("\\", "/").endsWith(".sqlite");
}

/**
 * zip 条目名安全化（zip-slip 防护）：拒绝绝对路径、盘符、UNC 与 .. 逃逸；
 * 返回归一化的 / 分隔相对路径，非法返回 null。
 */
export function sanitizeZipEntryName(entryName: string): string | null {
    const normalized = entryName.replaceAll("\\", "/");
    if (!normalized || normalized.startsWith("/") || normalized.startsWith("//") || /^[a-zA-Z]:/.test(normalized)) {
        return null;
    }
    const parts = normalized.split("/").filter((part) => part.length > 0 && part !== ".");
    if (parts.length === 0 || parts.some((part) => part === "..")) {
        return null;
    }
    return parts.join("/");
}
