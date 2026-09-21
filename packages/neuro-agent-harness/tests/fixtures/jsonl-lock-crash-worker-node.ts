import {writeFile} from "node:fs/promises";
import {JsonlSessionLock} from "../../src/storage/jsonl-lock.js";

const [lockPath, readyFile] = process.argv.slice(2);
if (!lockPath || !readyFile) {
    throw new Error("jsonl-lock-crash-worker-node 参数不完整");
}

await JsonlSessionLock.acquire(lockPath);
await writeFile(readyFile, String(process.pid), "utf8");
process.exit(0);
