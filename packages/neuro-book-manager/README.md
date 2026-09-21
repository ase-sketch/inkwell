# NeuroBook Manager

NeuroBook 的安装、更新、实例、Runtime 与工具链管理器。

没有安装Bun时，可以先通过平台Stage 0进入同一个安装向导：

```powershell
irm https://raw.githubusercontent.com/notnotype/neuro-book/master/scripts/install/install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/notnotype/neuro-book/master/scripts/install/install.sh | sh
```

POSIX Stage 0支持Linux x64/AArch64 glibc与macOS x64/ARM64：Linux依赖`sha256sum`并验证glibc，macOS使用系统`shasum -a 256`；两者都依赖`curl`和`unzip`。Windows普通用户也可以直接从GitHub Release下载`neuro-book-windows-x64.zip`解压使用。

POSIX Stage 0通过管道运行且没有参数时，会把Manager stdin重新连接到`/dev/tty`进入Clack；没有可用TTY时会在下载前拒绝。自动化必须显式使用`sh -s -- --profile <profile> --yes`。Windows Stage 0按原生OS架构判断，Windows ARM64不会下载x64 Bun；缓存和首次解压都必须通过executable checksum与版本检查。

直接运行且不传参数，会先检测当前目录：受管实例进入管理菜单，未接管的NeuroBook Git checkout进入接管菜单，普通目录进入部署菜单：

```bash
bunx --bun @notnotype/neuro-book-manager@canary
```

向导会说明部署方式并依次选择安装目录、实例名称、更新通道、端口和鉴权，并在最终确认前显示统一Install Preflight。自动化安装仍可显式传参：

```bash
bunx --bun @notnotype/neuro-book-manager@canary install --profile ghcr --yes
```

只读审计使用：

```bash
bunx --bun @notnotype/neuro-book-manager@canary install --profile ghcr --dry-run --json
```

Clack、`--yes`和`--dry-run`消费同一份宿主、命令、端口、目标目录、Release与组件来源报告；blocker不能被`--yes`跳过。Manager要求原生宿主架构与当前Bun进程架构一致，不支持Rosetta或其他跨架构进程运行安装与维护操作。

六种Profile分别是：Windows解压/托管运行时使用`windows-portable`；Linux/macOS容器部署使用`ghcr`；无容器的预构建Product使用`product-bun`；开发使用`source-dev`；本机源码生产构建使用`source-product`；容器内源码构建使用`source-docker`。Windows x64、Linux x64/AArch64 glibc和macOS x64/ARM64支持各自原生Product；Windows ARM64和Linux musl明确不支持。

容器Profile首次安装时会验证Docker/Podman CLI、Compose和engine状态，并把选定engine写入Installation Manifest与Operation Journal。后续start/update/rollback/doctor/create-admin始终使用该engine，不会在Docker与Podman之间静默切换；管理员命令只使用Docker Compose与`podman compose`共同支持的`compose exec`。

Managed Bun、ripgrep和PortableGit由统一Managed Asset Repository物化。既有不可变版本目录只有在当前有效Installation Manifest证明archive、source URL、全部executable checksum与真实版本时才可复用；Fresh Install、身份不完整或资产损坏时会在staging验证并提交新的不可变代次，旧目录和稳定wrapper在Manifest提交前保持不变。

安装成功后，实例会注册到 `~/.neuro-book-manager/config.json`。该文件只保存用户偏好、默认实例和实例目录索引；每个实例的真实部署状态仍由其 `.deploy/installation.json` 管理。

```bash
neuro-book manage
neuro-book instances list
neuro-book instances inspect . --json
neuro-book instances discover
neuro-book adopt . --profile source-dev
neuro-book --instance <name> status
neuro-book --root <path> doctor
```

`--root`、`--instance`和Manager自身`--version`是全局参数，必须写在子命令前；`install/update/runtime install`自己的`--version`写在子命令后，表示目标组件版本。

`neuro-book manage` 使用 blessed 提供多实例 TUI，可查看状态、执行诊断、启动、更新、注册、设置默认实例或忘记索引。忘记实例不会删除 Installation Root 或用户数据。

Windows Portable的State Root固定为`data/`。如果Installation Root下另外出现了真实`workspace/`目录，Manager会把它视为可能的数据分叉：`doctor`报告`state.shadow-workspace`失败，`status`给出人工处理步骤，`start`只警告并继续。Manager不会自动复制、合并、删除或重命名两个目录；junction或symlink若与`data/workspace/`指向同一真实目录则不会误报。

Windows Portable可使用`neuro-book --root <安装目录> start --no-health-check`跳过启动HTTP健康检查和自动打开浏览器。该参数仍执行启动前恢复与数据迁移，并保持Product前台运行；仅用于健康探测与实际服务状态不一致时的临时诊断，其他Profile会拒绝该参数。

已有Manifest v3/v4实例不自动迁移，需要重新安装程序并只复用完整用户状态；当前`instances import <path> --yes`只接受Manifest v5。`--yes`只接受“服务未启动”等warning，不能绕过checksum、wrapper或Operation blocker。无Manifest源码checkout使用`adopt`显式接管；三个Source Profile均在Installation Root的`.deploy/staging/<operation-id>`准备detached worktree，dirty、未知remote或非法branch会停止。无法证明revision/checksum的历史`.output`不会直接纳入管理。

`status`只做轻量路径、Operation和服务探测；`doctor`执行完整checksum、组件版本、wrapper内容、Source/Product revision、Compose镜像和HTTP版本检查。服务正常停止是warning且`healthy=true`，下一步会提示`start`；Docker/Compose不可用、运行中镜像或版本错误、HTTP不可达和组件损坏才会使doctor失败。Docker `start`会等待真实版本接口通过，Compose命令成功不等于应用健康。

Install、Update、Start、Migration、Admin、Desktop Reset与Uninstall共用Installation Mutation。外置heartbeat lease取得后先恢复未完成Operation，再重读磁盘Manifest；调用前缓存的Manifest不能作为执行依据。Operation Journal v5为Application State记录`planned → applying → applied → rolled_back`，并为Product切换保留operation-owned migration root；wrapper、SQLite、Git、Compose、镜像和Manifest恢复继续使用字段级ownership。缺少迁移脚本、runId不一致或`applied`操作返回`not_started`都会停止，不能静默启动不完整Product。

Windows Portable从包内Bun运行卸载时会安排外置Uninstall Host，等Manager退出后再删除程序文件。默认卸载保留`data/`，`uninstall --delete-data --yes`才删除全部；durable intent被修改时Host会拒绝删除并把失败写到外置结果文件。pending卸载会阻止安装、更新、启动等其他写操作。

不要使用 `bunx run @notnotype/neuro-book-manager`；`bunx run` 会把包名按本地脚本或路径解析，Manager 不会被启动。

公开命令为 `neuro-book`。应用源码、Product、Runtime、Toolchain、Deployment State 与用户状态使用独立组件合同。
