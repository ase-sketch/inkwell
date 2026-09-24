# nb-history 包规则

`@notnotype/nb-history` 是基于 SQLite/libsql 的文件历史与操作日志库，提供 append-only 事件溯源与内容寻址快照。

## 边界与依赖方向
- 纯底层通用库：供主应用及其他服务作为依赖消费，严禁依赖主应用页面、Nuxt 运行时或产品编排逻辑。
- 路径解耦：调用侧通过 `resolvePath` 适配具体宿主路径，本包不硬编码具体业务目录结构。

## 底线与验收
- 导出边界：外部消费与测试必须通过 package.json 声明的公开导出，严禁跨包私有源码深导入。
- 保持 package manifest 的导出声明（exports）与依赖语义稳定。
- 验收标准：改动通过 `bun run --cwd packages/nb-history test`。
