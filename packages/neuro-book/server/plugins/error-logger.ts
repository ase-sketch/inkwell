import {getRequestURL} from "h3";
import {appLogger} from "nbook/server/app-logs/logger";

type RequestErrorEvent = {
    method?: string;
    path?: string;
};

/**
 * 从未知错误中提取状态码。
 */
const resolveStatusCode = (error: unknown): number => {
    if (typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number") {
        return error.statusCode;
    }
    return 500;
};

/**
 * 从未知错误中提取摘要信息。
 */
const resolveErrorMessage = (error: unknown): string => {
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" && error.message) {
        return error.message;
    }
    if (typeof error === "object" && error !== null && "statusMessage" in error && typeof error.statusMessage === "string") {
        return error.statusMessage;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return "Unknown server error";
};

/**
 * 解析安全请求路径：只保留 pathname，不记录 query value。
 */
const resolveSafeRequestPath = (event: unknown): string => {
    if (!event || typeof event !== "object") {
        return "UNKNOWN";
    }
    try {
        return getRequestURL(event as Parameters<typeof getRequestURL>[0]).pathname;
    } catch {
        const rawPath = resolveRawRequestPath(event);
        if (!rawPath) {
            return "UNKNOWN";
        }
        return rawPath.split("?")[0] || "/";
    }
};

/**
 * 读取 H3 原始 path，用于清理错误消息中嵌入的 query。
 */
const resolveRawRequestPath = (event: unknown): string | null => {
    if (event && typeof event === "object" && "path" in event && typeof event.path === "string") {
        return event.path;
    }
    return null;
};

/**
 * 清理错误对象中由当前请求 URL 带入的 query，避免异常日志绕过请求日志摘要规则。
 */
const sanitizeRequestError = (error: unknown, rawPath: string | null, safePath: string): unknown => {
    if (!rawPath || !rawPath.includes("?") || !error) {
        return error;
    }
    if (error instanceof Error) {
        return {
            name: error.name,
            message: scrubRequestPath(error.message, rawPath, safePath),
            stack: error.stack ? scrubRequestPath(error.stack, rawPath, safePath) : undefined,
        };
    }
    if (typeof error === "string") {
        return scrubRequestPath(error, rawPath, safePath);
    }
    return error;
};

const scrubRequestPath = (text: string, rawPath: string, safePath: string): string => text.replaceAll(rawPath, safePath);

// @ts-ignore
export default defineNitroPlugin((nitroApp) => {
    // @ts-ignore
    nitroApp.hooks.hook("error", (error, context) => {
        const event = context.event as RequestErrorEvent | undefined;
        const method = event?.method ?? "UNKNOWN";
        const path = resolveSafeRequestPath(event);
        const rawPath = resolveRawRequestPath(event);
        const errorMessage = resolveErrorMessage(error);
        const message = rawPath && rawPath.includes("?") ? scrubRequestPath(errorMessage, rawPath, path) : errorMessage;

        void appLogger.error("server.request.error", {
            method,
            path,
            statusCode: resolveStatusCode(error),
            message,
        }, sanitizeRequestError(error, rawPath, path), `服务端请求失败: ${method} ${path}`);
    });
});
