/**
 * 从 $fetch / H3 异常中解析用户可读错误文案。
 */
export function resolveApiErrorMessage(error: unknown, fallback: string): string {
    if (typeof error !== "object" || error === null) {
        return fallback;
    }

    const data = "data" in error ? (error as {data?: unknown}).data : null;
    if (typeof data === "object" && data !== null && "message" in data && typeof (data as {message?: unknown}).message === "string") {
        return (data as {message: string}).message;
    }

    if ("message" in error && typeof (error as {message?: unknown}).message === "string") {
        return (error as {message: string}).message;
    }

    return fallback;
}
