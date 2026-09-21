import {createHash} from "node:crypto";

/** 内容 hash(R2):sha256(原始字节) hex。不做换行 / 编码归一化,恢复必须逐字节还原。 */
export function sha256Hex(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

/** 二进制启发式(R3):含 NUL 字节即视为二进制,不存快照 body。 */
export function looksBinary(bytes: Uint8Array): boolean {
    return bytes.includes(0);
}

/** 入参归一:string 按 UTF-8 编码成原始字节。 */
export function toBytes(content: Uint8Array | string): Uint8Array {
    return typeof content === "string" ? new TextEncoder().encode(content) : content;
}
