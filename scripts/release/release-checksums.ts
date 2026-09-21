import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {readFile, writeFile} from "node:fs/promises";
import {basename, resolve} from "node:path";

/** 为完整公开Release资产生成确定性的SHA256SUMS。 */
export async function writeReleaseChecksums(paths: string[], output: string): Promise<void> {
    const entries: string[] = [];
    for (const path of paths) entries.push(`${await sha256(path)}  ${basename(path)}`);
    await writeFile(output, `${entries.join("\n")}\n`, "utf8");
}

/** 验证SHA256SUMS恰好覆盖预期公开资产，拒绝缺失、额外或损坏文件。 */
export async function verifyReleaseChecksums(directory: string, expectedNames: string[]): Promise<void> {
    const content = await readFile(resolve(directory, "SHA256SUMS"), "utf8");
    const sums = new Map<string, string>();
    for (const line of content.split(/\r?\n/u).filter(Boolean)) {
        const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
        if (!match) throw new Error(`SHA256SUMS格式非法：${line}`);
        const [, checksum, name] = match;
        if (sums.has(name!)) throw new Error(`SHA256SUMS包含重复资产：${name}`);
        sums.set(name!, checksum!);
    }
    const expected = new Set(expectedNames);
    for (const name of sums.keys()) {
        if (!expected.has(name)) throw new Error(`SHA256SUMS包含未知资产：${name}`);
    }
    for (const name of expectedNames) {
        const declared = sums.get(name);
        if (!declared) throw new Error(`SHA256SUMS缺少资产：${name}`);
        const actual = await sha256(resolve(directory, name));
        if (actual !== declared) throw new Error(`Release资产SHA256不匹配：${name}`);
    }
}

/** 计算单个Release资产的SHA256。 */
async function sha256(path: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
}
