const absoluteNodeModulesFileUrlCheckPattern = /file:\/\/(?:\/?[A-Za-z]:\/|\/)[^'"\s]*?\/node_modules\//u;

/** 判断产物任意文本是否仍泄漏构建机绝对 node_modules file URL。 */
export function containsAbsoluteNodeModuleFileUrl(text) {
    return absoluteNodeModulesFileUrlCheckPattern.test(text);
}
