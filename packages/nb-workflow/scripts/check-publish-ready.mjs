import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * 发布前 gate：README/package.json/LICENSE 不能有未提交差异，防止把
 * 旧文档或旧版本号打进 npm tarball。
 */
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
execFileSync(
    "git",
    [
        "diff",
        "--quiet",
        "--",
        "README.md",
        "package.json",
        "LICENSE",
    ],
    {
        cwd: repoRoot,
        stdio: "pipe",
    },
);
console.log("PUBLISH_READY_OK");
