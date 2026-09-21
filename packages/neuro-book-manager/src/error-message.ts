/**
 * 把CLI边界收到的错误展开为可操作文本。
 *
 * `unknown`来自进程与第三方库错误边界；AggregateError的每个叶错误都必须保留，
 * 否则事务恢复失败会遮住最初导致操作失败的原因。
 */
export function formatCliError(error: unknown): string {
    const lines: string[] = [];
    appendError(error, lines, 0, new WeakSet<object>());
    return lines.join("\n");
}

/** 递归展开AggregateError与Error.cause，同时防止循环cause无限递归。 */
function appendError(error: unknown, lines: string[], depth: number, seen: WeakSet<object>): void {
    const prefix = depth === 0 ? "" : `${"  ".repeat(depth - 1)}- `;
    if (typeof error !== "object" || error === null) {
        lines.push(`${prefix}${String(error)}`);
        return;
    }
    if (seen.has(error)) {
        lines.push(`${prefix}<循环错误引用>`);
        return;
    }
    seen.add(error);
    if (error instanceof AggregateError) {
        lines.push(`${prefix}${error.message}`);
        for (const nested of error.errors) {
            appendError(nested, lines, depth + 1, seen);
        }
        return;
    }
    if (error instanceof Error) {
        lines.push(`${prefix}${error.message}`);
        if (error.cause !== undefined) {
            appendError(error.cause, lines, depth + 1, seen);
        }
        return;
    }
    lines.push(`${prefix}${String(error)}`);
}
