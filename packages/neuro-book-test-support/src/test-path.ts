import path from "node:path";
import {resolveAgentTempRoot} from "./paths";

/** `testHostPath` 的父目录名；该目录由 `@notnotype/neuro-book-test-support/vitest` 的 global setup 在每次 run 前创建。 */
export const TEST_HOST_PATHS_DIR = "test-paths";

/** 已规范化的文件系统绝对路径品牌；与应用运行时路径类型保持结构兼容。 */
export type AbsoluteFsPath = string & {readonly __absoluteFsPath: "absolute-fs-path"};

/** 为测试建立宿主原生绝对路径，统一落在受控系统临时根。 */
export function testHostPath(...segments: string[]): string {
    return path.resolve(resolveAgentTempRoot(), TEST_HOST_PATHS_DIR, ...segments);
}

/** 返回带有绝对文件系统品牌的测试路径。 */
export function testAbsoluteFsPath(...segments: string[]): AbsoluteFsPath {
    return testHostPath(...segments) as AbsoluteFsPath;
}
