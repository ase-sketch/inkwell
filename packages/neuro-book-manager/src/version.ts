/** 比较简化 SemVer；返回负数、0、正数。 */
export function compareVersions(left: string, right: string): number {
    const a = parseVersion(left);
    const b = parseVersion(right);
    for (let index = 0; index < 3; index += 1) {
        const difference = a.numbers[index]! - b.numbers[index]!;
        if (difference !== 0) {
            return difference;
        }
    }
    if (a.prerelease === b.prerelease) {
        return 0;
    }
    if (!a.prerelease) {
        return 1;
    }
    if (!b.prerelease) {
        return -1;
    }
    return a.prerelease.localeCompare(b.prerelease, "en", {numeric: true});
}

function parseVersion(input: string): {numbers: [number, number, number]; prerelease: string} {
    const match = input.trim().replace(/^v/u, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?/u);
    if (!match) {
        throw new Error(`无法解析版本号：${input}`);
    }
    return {
        numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
        prerelease: match[4] ?? "",
    };
}
