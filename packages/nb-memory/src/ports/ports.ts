/**
 * 可注入端口：LLM / embedding / 存储。
 *
 * 宿主（nb-memory-bench、主仓 runtime）各自注入实现；库内不直接依赖任何
 * 网络端点或磁盘布局。接口形状刻意与 nb-memory-bench 的 ChatClient /
 * EmbedClient 同构，宿主可以把现成客户端直接传入（结构化类型即插即用）。
 */
import {mkdir, readFile, appendFile, writeFile} from "node:fs/promises";
import {join} from "node:path";

/** chat 一次调用的输入 */
export interface LlmRequest {
    system: string;
    user: string;
    /** 期望 JSON 输出时置 true（真实端点走 response_format） */
    json?: boolean;
}

/** LLM 端口：摄入期「抽取+归一」联合调用使用（S2 起） */
export interface LlmPort {
    chat(req: LlmRequest): Promise<string>;
}

/** embedding 端口：返回 L2 归一化向量；内部自行分批 */
export interface EmbedPort {
    embed(texts: string[]): Promise<number[][]>;
    readonly dims: number;
}

/** 存储端口：命名文本文件的读写与行追加（jsonl 事实源） */
export interface StoragePort {
    /** 读整个文件；不存在返回 null */
    read(name: string): Promise<string | null>;
    /** 覆写整个文件 */
    write(name: string, text: string): Promise<void>;
    /** 追加一行（自动补换行） */
    appendLine(name: string, line: string): Promise<void>;
}

/** 文件系统存储：一个根目录下的扁平命名文件 */
export class FsStorage implements StoragePort {
    private constructor(private readonly dir: string) {}

    /** 打开（不存在则建目录） */
    static async open(dir: string): Promise<FsStorage> {
        await mkdir(dir, {recursive: true});
        return new FsStorage(dir);
    }

    async read(name: string): Promise<string | null> {
        try {
            return await readFile(join(this.dir, name), "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
            throw error;
        }
    }

    async write(name: string, text: string): Promise<void> {
        await writeFile(join(this.dir, name), text, "utf8");
    }

    async appendLine(name: string, line: string): Promise<void> {
        await appendFile(join(this.dir, name), line + "\n", "utf8");
    }
}

/** 内存存储：单测与离线冒烟用 */
export class MemStorage implements StoragePort {
    private readonly files = new Map<string, string>();

    async read(name: string): Promise<string | null> {
        return this.files.get(name) ?? null;
    }

    async write(name: string, text: string): Promise<void> {
        this.files.set(name, text);
    }

    async appendLine(name: string, line: string): Promise<void> {
        this.files.set(name, (this.files.get(name) ?? "") + line + "\n");
    }
}
