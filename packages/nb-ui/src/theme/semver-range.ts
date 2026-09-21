/**
 * 最小 semver 范围匹配，只服务于主题包的 `hostVersion` 校验。
 *
 * **不是 semver 的完整实现**，刻意只支持四种写法：
 *
 * | 写法 | 含义 |
 * | --- | --- |
 * | `*` 或空串 | 任意版本 |
 * | `1.2.3` | 精确等于（含 prerelease 后缀，逐字比较） |
 * | `^1.2.3` | 同一「兼容段」内且不低于它。主版本 0 时兼容段是次版本（`^0.2.3` = `>=0.2.3 <0.3.0`） |
 * | `~1.2.3` | 同一次版本内且不低于它（`>=1.2.3 <1.3.0`） |
 * | `>=1.2.3` | 不低于它 |
 *
 * 复合范围（`>=1.0.0 <2.0.0`、`||`）**抛错**而不是返回 false——静默判否会让主题作者
 * 面对一句「宿主版本不匹配」却查不出原因。真正需要全范围支持时，在市场平台侧用 semver 包，
 * 不把这个依赖压给每个 nb-ui 消费方（semver 现在只是传递依赖）。
 *
 * **与 semver 的一处刻意偏差**：范围比较时忽略 prerelease 与 build metadata，
 * `0.2.0-alpha.0` 按 `0.2.0` 参与比较。标准 semver 下 `^0.2.0` 不匹配 `0.2.0-alpha.0`，
 * 而 nb-ui 现在就是 alpha，照标准做会把所有写 `^0.2.0` 的主题全部拒掉。
 */

type Version = {major: number; minor: number; patch: number};

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

/** 解析版本号，忽略 prerelease 与 build metadata。无法解析时返回 null。 */
function parseVersion(raw: string): Version | null {
    const matched = VERSION_PATTERN.exec(raw.trim());
    if (matched === null) {
        return null;
    }
    return {
        major: Number(matched[1]),
        minor: Number(matched[2]),
        patch: Number(matched[3]),
    };
}

/** 按 major/minor/patch 依次比较。a < b 返回负数，相等返回 0。 */
function compare(a: Version, b: Version): number {
    return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** `^` 的上界：主版本非 0 时是下一个主版本，主版本为 0 时是下一个次版本。 */
function caretUpperBound(base: Version): Version {
    if (base.major > 0) {
        return {major: base.major + 1, minor: 0, patch: 0};
    }
    return {major: 0, minor: base.minor + 1, patch: 0};
}

/**
 * 判断 `version` 是否落在 `range` 内。
 *
 * @throws 范围写法不受支持，或版本号解析不了时抛 Error（调用方负责包装成可读的装载失败原因）
 */
export function satisfiesRange(version: string, range: string): boolean {
    const spec = range.trim();

    if (spec === "" || spec === "*") {
        return true;
    }
    if (spec.includes("||") || /\s/.test(spec)) {
        throw new Error(`不支持复合版本范围 "${range}"，只支持 *、精确版本、^x.y.z、~x.y.z、>=x.y.z`);
    }

    const parsedVersion = parseVersion(version);
    if (parsedVersion === null) {
        throw new Error(`无法解析版本号 "${version}"`);
    }

    // 精确匹配走逐字比较：连 prerelease 后缀一起对，这是唯一能钉死到某个 alpha 的写法
    if (/^\d/.test(spec)) {
        return version.trim() === spec;
    }

    const operator = spec.startsWith(">=") ? ">=" : spec.slice(0, 1);
    const base = parseVersion(spec.slice(operator.length));
    if (base === null) {
        throw new Error(`无法解析版本范围 "${range}"`);
    }

    switch (operator) {
        case "^":
            return compare(parsedVersion, base) >= 0 && compare(parsedVersion, caretUpperBound(base)) < 0;
        case "~":
            return (
                compare(parsedVersion, base) >= 0 &&
                compare(parsedVersion, {major: base.major, minor: base.minor + 1, patch: 0}) < 0
            );
        case ">=":
            return compare(parsedVersion, base) >= 0;
        default:
            throw new Error(`不支持的版本范围写法 "${range}"，只支持 *、精确版本、^x.y.z、~x.y.z、>=x.y.z`);
    }
}
