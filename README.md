# NovaSched · Zen Edition

[![version](https://img.shields.io/badge/version-v2.2.0-green)](#安装)
[![platform](https://img.shields.io/badge/platform-arm64--v8a-blue)](#安装)
[![license](https://img.shields.io/badge/license-GPL--3.0--only-important)](LICENSE)

面向骁龙、天玑与玄戒平台的用户态调度模块。根据设备实际的 CPU policy、频率范围和调速器加载配置，提供省电、均衡、性能、极速四档调度，支持应用单独规则、Scene N1 联动、FAS 跟随与原厂节点恢复。WebUI 基于《星辞 液态玻璃》WebGL2 引擎构建。

作者：**ZenJooo**。当前版本 **v2.2.0**，版本代码 **320**。本仓库包含完整源码，更新内容见 [CHANGELOG.md](CHANGELOG.md)。

## 支持的处理器

| 配置标识 | 处理器 |
|---|---|
| SM8450 | 骁龙 8 Gen 1 |
| SM8475 | 骁龙 8+ Gen 1 |
| SM8550 | 骁龙 8 Gen 2 |
| SM8650 | 骁龙 8 Gen 3 |
| SM8750 | 骁龙 8 Elite |
| SM8850 | 骁龙 8 Elite Gen 5 |
| DIMENSITY8350 | 天玑 8350 |
| DIMENSITY9400PLUS | 天玑 9400+ |
| XRING_O3 | 玄戒 O3 |

天玑 8350、天玑 9400+ 与玄戒 O3 自 v2.0.0 加入；骁龙 8 Elite Gen 5 保留原有支持并补充回归验证。新增平台按提供的 cpuinfo 资料建立核心映射，玄戒 O3 按小核在 CPU4–7 的编号处理。policy 编号、频率上下限和可用调速器均在设备上读取，默认保留可用的原厂调速器，新增平台不依赖高通专用节点。

处理器识别需要系统属性、设备树或 cpuinfo 中明确的型号证据。仅有 ARM 核心型号或共用的平台代号，无法区分具体芯片时会说明原因并中止安装。提供的 cpuinfo 没有频率表和调速器列表，新平台使用相对频率配置，最终取值按设备实际频率范围计算。

安装不限制手机品牌，也不按 root 管理器版本号拦截；会检查 arm64、核心运行能力和硬件节点。

## 功能

- **四档调度**：省电一省到底，各簇频率上限进一步压低；均衡在保留日用流畅度的同时压住各簇上限（v2.2.0 起不再不限频）；性能按平台适当提高最低频率；极速开放完整频率范围——含设备的 boost OPP（如骁龙 8 Gen 2 超大核 3.2GHz）——并在支持的配置上应用调速器参数。
- **自动调度**：默认开启。前台游戏用极速，退出游戏后，日用、桌面、锁屏与待机用省电。系统分类与精确游戏名单共同识别；可以手动把应用标记为游戏或日用。
- **应用单独规则**：关闭自动模式后，为应用设置独立档位，其余使用手动默认档位。
- **Scene N1 联动**：查询当前 Android 用户实际是否安装 Scene，忽略全局包记录与残留目录。手动模式的档位和应用规则可在 Scene 与 WebUI 间同步；Scene 调度槽被其它调度器占用时暂停节点写入。
- **FAS 跟随**：不自行实现帧感知调度。检测到 Scene N1 自带 FAS（fas-rs）时，所有档位切换同步写入其模式节点（`/dev/fas_rs/mode`），FAS 的余帧与温控策略仍由 Scene 侧配置决定。
- **WebUI**：完整液态玻璃单页（设计语言照搬 SleepDown 课程表官网）——玻璃胶囊导航、径向光斑 Hero 与档位轮播卡、概览三卡、四档选择板与自动调度开关、应用规则编辑、按需日志流、深浅双主题与滚动入场动画。
- **原厂快照与卸载**：首次控制节点前记录原始值和权限。卸载时先停止写入、恢复节点和 Scene 原回调，再清理模块配置、凭据、备份及日志。
- **配置升级**：更新未修改的默认配置；手动参数在转换时保留，改写前另存原文件。

v2.0.0 已移除「极限节能」和「流畅省电」开关、通信命令及调度分支。省电档统一使用标准配置。旧的 `options.txt` 不再读取，升级会移除配置中的对应字段。

## 安装

1. 设备需为 **arm64-v8a**，并具有 root 权限，支持 Magisk / Alpha / KernelSU 系列 / APatch。
2. 若仍启用旧模块 `LittleYouran_CTS_Rust`，先停用并卸载，重启后再安装。
3. 在 root 管理器中刷入 `NovaSched-v2.2.0-release.zip`。
4. 六阶段“装机小剧场”穿插短对话，耗时任务每三秒报告真实等待与轮换提示；详细适配数据放进日志。Scene 整步限时十秒，失败或超时会明确跳过并进入第六步；必需检查失败则停止安装。
5. 安装完成后重启手机，确保新版守护进程生效。

全新安装与首次从 v2.0.0 升级默认开启**自动调度**，开机先使用省电档，确认前台游戏后切到极速。覆盖安装保留手动档位、应用规则和配置。之后手动关闭的自动调度偏好、分类修正会在重启和再次升级时保留。安装流程不需要按音量键选择省电子选项。

运行文件：

| 路径 | 用途 |
|---|---|
| `/data/adb/novasched/config.json` | 当前用户配置 |
| `/data/adb/novasched/config.default.json` | 当前版本默认配置参考 |
| `/data/adb/novasched/config.*.before-*.json` | 配置转换或替换前的备份 |
| `/data/adb/novasched/mode.txt` | 最近成功下发的档位 |
| `/data/adb/novasched/app_modes.txt` | 手动默认档位与应用规则 |
| `/data/adb/novasched/automatic.json` | 自动调度开关与应用分类修正 |
| `/data/adb/novasched/novasched.log` | 运行日志 |
| `<模块目录>/boot-entry.log` | 开机入口日志；保留核心运行前的错误，随模块移除 |
| `/sdcard/Android/NovaSched/log.txt` | 外部日志镜像，不可用时跳过 |

升级时会比较现有配置和旧默认参考。确认未修改的默认配置才会随版本更新；手动调整的频率、CPUSet、uclamp、输入加速和扩展字段会保留。无效配置或处理器身份冲突会中止初始化，原文件保持不变。

## 卸载

在 root 管理器中移除模块并重启。卸载先禁止新启动和旧 Scene 回调写入，等待守护及监督退出，再恢复原厂节点值、权限、属性、服务和有备份的 Scene 原回调。没有备份标记的 NovaSched 自有回调也会移除；用户后来换用的其它调度器会保留。

清理范围包括 `/data/adb/novasched` 整个运行目录、各 Android 用户的 `Android/NovaSched` 日志镜像、安装检查记录和本模块的待更新副本；模块本体由管理器移除。卸载不会再留下 `uninstall.log`。已经手动导出的日志或下载的 ZIP 属于用户文件。

开机早期共享存储仍被加密时，卸载会明确报告并安排一次性清理：用户解锁后移除日志并自删脚本，不阻塞开机。如果十五分钟内仍未解锁，辅助进程退出，脚本留待下一次开机重试；多用户设备需要对应用户的存储解锁。重新安装本模块后，旧清理任务会取消并自删，保留新的日志。

节点恢复遇到错误时仍继续清理，并显示需要重启的具体说明。仍有进程持锁且无法核验身份时，会明确报错并保留恢复资料；不能在进程继续写入时假装清理完成。重复执行卸载不会影响其它模块或 Scene 应用数据。

## WebUI 使用

在管理器的模块 WebUI 入口打开。没有内置入口时，可使用 KsuWebUI 独立版或 WebUI X，并授予宿主 root / Shell 权限。

- **概览**：玻璃卡片显示实际档位、前台应用与控制来源，Hero 区提供档位轮播、自动调度快捷开关与连接徽章。
- **档位**：四档玻璃卡片点击即切，选中态高亮并等待守护进程读回确认；自动调度开关与反馈同区显示。
- **规则**：创建、编辑和删除应用独立档位；玻璃弹窗含包名输入与四档选择，规则行使用应用名首字符徽标。
- **日志**：进入日志区时按需连接，级别过滤、跟随开关、单条详情与筛选复制。
- **关于**：版本、处理器、配置模板、Scene FAS 状态、外观（跟随系统/浅色/深色）与只读诊断。

页面优先通过本机 WebSocket 连接守护进程。WebView 阻止回环连接时，自动尝试已授权宿主的 root 备用通道。实际心跳有效且认证通过后，界面才显示在线状态。界面为 DOM + CSS 液态玻璃实现，设计语言完整照搬 SleepDown 课程表官网（sleepdownschedule.cn）：#007aff 单强调色、玻璃胶囊导航、34–38px 圆角卡片、reveal 滚动入场。

自动模式始终优先于本模块手动档位、应用规则和 Scene 底座请求，不会因为旧 `mode.txt` 的极速记录而把日用留在极速档。外部 Scene 调度器接管时，NovaSched 仍暂停写入，自动开关与分类编辑保持只读。

自动识别使用 ActivityManager 的当前聚焦活动，兼容 `topResumedActivity`、`mResumedActivity` 与 `ResumedActivity` 输出，避免把画中画或后台仍存活的游戏当作前台。前台查询最多每两秒一次，带超时和输出限额；应用分类缓存十分钟，未知分类三十秒后重试，安装记录变化时清缓存。系统游戏类型先通过只读 `cmd game list-modes` 查询，再补充包信息与精确游戏名单；不修改系统 Game Mode。系统未提供可验证分类或前台查询失败时先用省电，可以在 WebUI 修正。

完整退出、回桌面、切到日用、锁屏与亮屏恢复都会重新选择档位。默认窗口为约两秒，加上系统查询与内核下发耗时；实际延迟和功耗需在真机上测量。

## 命令行

在 root shell 中使用模块的 `bin/novasched`：

```sh
novasched status                       # 运行状态与实际心跳
novasched diagnose                     # 进程身份、开机入口与启动失败记录
novasched game-diagnose                # 采样实际节点和温度
novasched scene-status                 # 当前用户 Scene 安装状态
novasched scene-diagnose               # Scene 联动状态
novasched reload                       # 重新加载配置
novasched stop                         # 停止调度
novasched restore                      # 恢复原厂节点快照
novasched uninstall                    # 停止、恢复并清理模块数据；通常由管理器调用
novasched scene-install                # 注册 Scene 联动
novasched scene-restore                # 还原 Scene 联动
novasched probe
novasched check-config
novasched prepare-config
novasched self-test
novasched version
```

命令可加 `--module-dir <模块目录>` 指定模块路径。CPUSet、uclamp、输入加速、CFS、GPU、性能服务或热插拔控制范围变化时，需要重启；重新加载会说明原因并保留当前运行配置。

## 本地连接认证

WebUI 使用守护进程每次启动生成的会话凭据，签发前检查进程身份和心跳；凭据文件权限为 `0600`。WebSocket 验证协议、token 与来源，token 通过子协议传递。源码中的协议标识为公开常量，会话 token 不打包进发布文件。

## 从源码构建

需要 Rust（最低版本见 `native/Cargo.toml`）、`aarch64-linux-android` 标准库、Android NDK r27d、Python 3、bash 与 GNU readelf / ripgrep。推荐 Linux 或 WSL。WebUI 检查另需 Node.js 和 npm。

```sh
rustup target add aarch64-linux-android
ANDROID_NDK_HOME=/path/to/ndk CARGO=/path/to/cargo bash scripts/build.sh
```

构建脚本运行 Rust 测试，生成 AArch64 静态 ELF，校验无动态解释器或共享库依赖及 16KB LOAD 段对齐，再输出刷入包、源码包与 SHA256 校验文件至 `dist/`。构建主机不能读取 `/proc/self/stat` 时，会明确跳过依赖真实进程的身份测试。

只生成源码包无需 Android 工具链，也可在已解压的源码目录执行：

```sh
python3 scripts/package-release.py --source-only
```

其它回归检查：

```sh
python3 scripts/generate-profiles.py --check
cargo build --manifest-path native/Cargo.toml --locked --offline
python3 scripts/test-installer.py
npm ci --ignore-scripts
npm run test:webui
```

自动化检查覆盖配置、节点映射、升级、协议和界面状态，不能替代真机上的功耗、温度、帧率和管理器兼容性测试。本次未进行物理 Android 设备测试。

## 仓库结构

```text
module-template/   模块脚本、配置、WebUI 和安装入口
native/            Rust 调度核心、守护进程与 cpuinfo 回归资料
scripts/           构建、打包、配置生成和检查脚本
```

## 常见问题

- **WebUI 显示未连接**：确认宿主已获 root / Shell 权限，通过诊断入口读取状态，也可检查 `novasched status` 和开机入口日志。
- **覆盖安装后仍显示旧版**：重启手机后重新打开 WebUI，模块已关闭页面缓存。
- **无法识别处理器**：保留安装探测输出。型号证据不足或相互冲突时不会猜测芯片；可以先读取 `ro.soc.model`、`ro.vendor.soc.model` 和 cpuinfo 的 Hardware 字段排查。
- **手动配置升级失败**：检查安装输出和 `config.profile`，保留原配置及备份；不要直接删除自定义参数。
- **Scene 没有联动**：可执行 `scene-install` 注册、`scene-restore` 还原；若其它调度器占用了 Scene 调度槽，先处理占用。

## 许可

GPL-3.0-only，详见 [LICENSE](LICENSE)。第三方图标授权见 [NOTICE](NOTICE) 与 `module-template/webroot/licenses/`。
