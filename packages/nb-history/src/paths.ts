import {HistoryError} from "./types";

/**
 * 路径防御校验(R1 通用化):只拒绝空路径与 NUL 字节——这两者是任何宿主都无法
 * 接受的畸形输入。不做相对 / 绝对、反斜杠、`..` 等约束:路径的**语义**(相对
 * 什么根、如何规范化)由宿主决定,模块只要求「同一文件始终用同一字符串」——
 * 与「模块不做路径过滤策略」的既有边界一致。
 */
export function validatePath(path: string): string {
    if (path.length === 0) {
        throw new HistoryError("路径不能为空");
    }
    if (path.includes("\0")) {
        throw new HistoryError(`路径含 NUL 字节: ${path}`);
    }
    return path;
}
