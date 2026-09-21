import {readFile} from "node:fs/promises";
import {parseSourcePackageManifest, sourcePackageManifestPath, type SourcePackageManifest} from "@notnotype/neuro-book-contracts/source";
import {findRepositoryRoot} from "#scripts/utils/workspace-roots";

/** 读取并验证应用 identity-only manifest；读取位置属于 root adapter。 */
export async function readApplicationPackageManifest(
    repositoryRoot: string = findRepositoryRoot(),
): Promise<SourcePackageManifest> {
    const manifestPath = sourcePackageManifestPath(repositoryRoot);
    let text: string;
    try {
        text = await readFile(manifestPath, "utf8");
    } catch (error) {
        throw new Error(`无法读取应用 identity manifest：${manifestPath}`, {cause: error});
    }
    let value: unknown;
    try {
        value = JSON.parse(text) as unknown;
    } catch (error) {
        throw new Error(`应用 identity manifest 不是有效 JSON：${manifestPath}`, {cause: error});
    }
    return parseSourcePackageManifest(value);
}

export async function readApplicationPackageVersion(
    repositoryRoot: string = findRepositoryRoot(),
): Promise<string> {
    return (await readApplicationPackageManifest(repositoryRoot)).version;
}
