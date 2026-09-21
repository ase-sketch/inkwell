import {mkdir, stat, writeFile} from "node:fs/promises";
import {resolve} from "node:path";

import {run} from "#scripts/utils/process.mjs";

const MANAGER_PACKAGE_NAME = "@notnotype/neuro-book-manager";

export type PublicManagerPackage = {
    root: string;
    executable: string;
    schema: string;
    gitHead: string;
};

/**
 * 下载并展开npm已经公开的精确Manager包。
 *
 * Release与Portable必须消费Trusted Publisher产出的同一份bundle，不能在另一操作系统上
 * 重新构建后假定Bun bundle字节可复现。
 */
export async function materializePublicManagerPackage(version: string, targetRoot: string): Promise<PublicManagerPackage> {
    const metadataResponse = await fetch(`https://registry.npmjs.org/${encodeURIComponent(MANAGER_PACKAGE_NAME)}/${encodeURIComponent(version)}`);
    if (!metadataResponse.ok) {
        throw new Error(`npm registry中不存在${MANAGER_PACKAGE_NAME}@${version}：HTTP ${metadataResponse.status}`);
    }
    const metadata = await metadataResponse.json() as {
        gitHead?: string;
        dist?: {tarball?: string};
    };
    if (!metadata.dist?.tarball) {
        throw new Error(`npm registry元数据缺少${MANAGER_PACKAGE_NAME}@${version} tarball。`);
    }
    if (!metadata.gitHead?.match(/^[0-9a-f]{40}$/u)) {
        throw new Error(`npm registry元数据缺少合法gitHead：${MANAGER_PACKAGE_NAME}@${version}`);
    }

    const tarballResponse = await fetch(metadata.dist.tarball);
    if (!tarballResponse.ok) {
        throw new Error(`下载Manager公开tarball失败：HTTP ${tarballResponse.status}`);
    }
    await mkdir(targetRoot, {recursive: true});
    const archive = resolve(targetRoot, "public-manager.tgz");
    await writeFile(archive, new Uint8Array(await tarballResponse.arrayBuffer()));
    await run("tar", ["-xzf", archive, "-C", targetRoot]);

    const packageRoot = resolve(targetRoot, "package");
    const packageJson = await Bun.file(resolve(packageRoot, "package.json")).json() as {name?: string; version?: string};
    if (packageJson.name !== MANAGER_PACKAGE_NAME || packageJson.version !== version) {
        throw new Error(`Manager公开tarball身份错误：${String(packageJson.name)}@${String(packageJson.version)}`);
    }
    const executable = resolve(packageRoot, "dist", "neuro-book.mjs");
    const schema = resolve(packageRoot, "dist", "schema.mjs");
    await Promise.all([stat(executable), stat(schema)]);
    return {root: packageRoot, executable, schema, gitHead: metadata.gitHead};
}
