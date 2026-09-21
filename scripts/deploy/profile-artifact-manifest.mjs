/**
 * 将磁盘 Profile manifest 的两种序列化形态归一化为部署脚本可直接使用的 artifact 引用。
 * manifest 为节省体积可能只保存 artifactSha/typeSha，文件名必须与 runtime loader 使用同一规则派生。
 */
export function normalizeProfileManifestProfiles(manifest, manifestPath) {
    const profiles = Array.isArray(manifest.profiles)
        ? manifest.profiles
        : Object.values(manifest.profiles ?? {});
    if (profiles.length === 0) {
        throw new Error(`Product profile manifest 没有 Profile：${manifestPath}`);
    }
    return profiles.map((profile) => {
        const artifactSha = typeof profile.artifactSha === "string" ? profile.artifactSha : profile.artifactSha256;
        const typeSha = typeof profile.typeSha === "string" ? profile.typeSha : profile.typeSha256;
        return {
            ...profile,
            artifactFileName: typeof profile.artifactFileName === "string"
                ? profile.artifactFileName
                : typeof artifactSha === "string"
                    ? `artifacts/${artifactSha}.mjs`
                    : undefined,
            typeFileName: typeof profile.typeFileName === "string"
                ? profile.typeFileName
                : typeof artifactSha === "string" && typeof typeSha === "string"
                    ? `artifacts/${artifactSha}.types.d.ts`
                    : undefined,
        };
    });
}
