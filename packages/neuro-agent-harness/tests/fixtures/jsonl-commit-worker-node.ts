import {existsSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import {JsonlSessionStore} from "../../src/storage/jsonl.js";

const [directory, sessionIdText, expectedVersionText, valueText, startFile, readyFile] = process.argv.slice(2);
if (!directory || !sessionIdText || !expectedVersionText || !valueText || !startFile || !readyFile) {
    throw new Error("jsonl-commit-worker-node 参数不完整");
}

await writeFile(readyFile, "ready", "utf8");
while (!existsSync(startFile)) {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
}

try {
    const value = Number(valueText);
    const result = await new JsonlSessionStore({directory}).commit({
        target: Number(sessionIdText),
        expectedVersion: Number(expectedVersionText),
        cause: `test.node-process.worker.${value}`,
        operations: [{type: "appendEntries", entries: [{kind: "worker", payload: value}]}],
    });
    console.log(JSON.stringify({status: "fulfilled", version: result.snapshot.version, value}));
} catch (error) {
    const failure = error instanceof Error
        ? {name: error.name, message: error.message}
        : {name: "UnknownError", message: String(error)};
    console.log(JSON.stringify({status: "rejected", ...failure}));
}
