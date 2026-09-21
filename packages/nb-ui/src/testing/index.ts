/**
 * 测试工具包。**只在测试里 import**——这些模块依赖 vitest 与 @vue/test-utils，
 * 不该出现在产品构建里，所以单独走 `@notnotype/nb-ui/testing` 这个子路径。
 *
 * 目前只有一件东西：可覆盖组件的契约测试套件。主题作者写了自己的实现之后，
 * 用它证明自己确实实现了对应契约。
 */
export {runTimePickerContract} from "./time-picker-contract-suite";
