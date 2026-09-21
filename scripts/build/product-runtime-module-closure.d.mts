/** Product package island 的构建期保留理由与对应 smoke。 */
export interface ProductRuntimeNativeIsland {
    packages: string[];
    reason: string;
    smoke: string;
}

/** 最终 bundle 中无法静态还原的动态 import 合同。 */
export interface ProductRuntimeOpaqueImport {
    pathPattern: string;
    count: number;
    reason: string;
    smoke: string;
}

/** native-islands.json 经过收窄后的稳定身份。 */
export interface ProductRuntimeNativeIslandManifest {
    schema: "nbook.product-native-islands/v2";
    platform: string;
    islands: ProductRuntimeNativeIsland[];
    opaqueImports: ProductRuntimeOpaqueImport[];
}

/** 一个最终 bundle opaque import 的可审查观察值。 */
export interface ProductRuntimeOpaqueImportObservation {
    modulePath: string;
    expression: string;
    fingerprint: `sha256:${string}`;
    pathPattern: string;
}

/** 最终 Product 可执行模块图的结构化复核结果。 */
export interface ProductRuntimeClosureResult {
    roots: number;
    modules: number;
    references: number;
    opaqueImports: number;
    opaqueImportObservations: ProductRuntimeOpaqueImportObservation[];
    packages: string[];
    nativeIslands: ProductRuntimeNativeIslandManifest;
}

/** 复核最终 Product 可执行模块闭包、native islands 与 opaque imports。 */
export function assertProductRuntimeModuleClosure(options: {
    imageRoot: string;
    buildRoots?: string[];
    expectedPlatform?: string;
}): Promise<ProductRuntimeClosureResult>;
