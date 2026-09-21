import {existsSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import {JsonlSessionStore} from "../../src/storage/jsonl.js";

const [directory, mode, owner, startFile, readyFile, explicitIdText] = Bun.argv.slice(2);
if (
    !directory
    || !mode
    || !owner
    || !startFile
    || !readyFile
    || (mode !== "auto" && mode !== "explicit")
    || (mode === "explicit" && !explicitIdText)
) {
    throw new Error("jsonl-create-worker 参数不完整");
}

await writeFile(readyFile, "ready", "utf8");
while (!existsSync(startFile)) {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
}

try {
    const result = await new JsonlSessionStore({directory}).create({
        ...(mode === "explicit" ? {sessionId: Number(explicitIdText)} : {}),
        profileKey: "process-create",
        initial: {owner},
        hostContext: {},
    });
    console.log(JSON.stringify({status: "fulfilled", sessionId: result.metadata.sessionId, owner}));
} catch (error) {
    const failure = error instanceof Error
        ? {name: error.name, message: error.message}
        : {name: "UnknownError", message: String(error)};
    console.log(JSON.stringify({status: "rejected", owner, ...failure}));
}
