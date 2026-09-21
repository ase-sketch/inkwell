export const TEST_RUN_ID_ENV = "NBOOK_TEST_RUN_ID";

/**
 * 判断 owner 进程是否仍活跃。
 * ESRCH 表示进程不存在；EPERM 表示存在但无权限，视为存活。无法判定一律视为存活。
 */
export function isProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) return true;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return !(typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH");
    }
}
