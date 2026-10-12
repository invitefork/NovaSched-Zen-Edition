# NovaSched v2.1.0 验证记录

验证日期：2026-10-10。作者：ZenJooo。版本：v2.1.0 / 310。

本次修改以用户提供的 `NovaSched-v2.0.0-source.zip` 为基线，保留九个处理器配置及 v2.0.0 已完成的省电开关移除。没有 Android 真机接入；以下通过项是主机构建、模拟节点与协议检查。

## 执行结果

| 项目 | 结果 | 范围 |
|---|---|---|
| Rust 主机回归 | 156 通过，1 项因缺少 `/proc` 跳过 | 原有调度、快照、配置、生命周期、认证，加上当前用户 Scene 检测、游戏分类、实际节点切换与偏好保存 |
| WebUI DOM / 协议 / 静态检查 | 106 通过 | 自动切换、分类修正、已保存与已应用分开确认、外部接管锁定、WebSocket 和 root 通道、原有界面行为 |
| 安装流程检查 | 35 通过 | root 管理器入口、错误传播、配置保留、Scene 三种状态、偏好保留、六阶段日志、真实等待提示 |
| 处理器默认配置一致性 | 9 通过 | SM8450 / SM8475 / SM8550 / SM8650 / SM8750 / SM8850 / DIMENSITY8350 / DIMENSITY9400PLUS / XRING_O3 |
| JavaScript 与 shell 语法 | 通过 | `node --check`、`sh -n` |
| 差异与格式 | 通过 | `git diff --check`、Rust 格式检查 |
| Android 核心 | 构建通过 | Rust 1.85.1、Android NDK r27d、aarch64-linux-android、静态 bionic |
| ELF | 通过 | AArch64、无动态解释器、无共享库依赖、LOAD 段 16KB 对齐 |
| 发布 ZIP | 通过 | CRC、版本/作者、可执行权限、认证协议一致、内置核心与构建核心一致；源码包含 `native/games.list` |

构建环境不开放真实 `/proc`，跳过的测试是 `process_identity::regression_tests::live_unrelated_process_is_not_accepted_as_daemon`。其余进程身份解析和模拟文件测试继续执行。

## Scene 修复

旧安装脚本有固定的条件说明，容易被读成已经检测到 Scene；旧核心还会信任全局包记录。新版分别显示「当前用户已安装」「当前用户未安装」「查询失败」，查询时显式传入当前 Android 用户，禁用应用仍算已安装，不包含已卸载记录。

回归覆盖：当前用户 10 的查询参数、当前用户卸载后旧回调仍在的情况、相似包名、系统服务报错与命令回退、未知用户不默认当作用户 0、安装/卸载/重新安装的控制权变化。读取 Scene XML 跟随当前用户；外部调度器遇到检测失败仍保留暂停保护。

## 自动调度

默认启用，先省电，确认前台为游戏再使用极速。关闭后恢复原有手动档位与应用规则；再次安装不重置已经明确关闭的偏好。用户分类优先于系统分类与精确游戏名单。

回归覆盖：

- 系统只读游戏类型查询识别未收录的游戏；没有性能 Game Mode 也可识别为游戏。
- AOSP 包输出省略游戏字段时保留未知状态，避免把缺少字段当成确切的日用分类。
- 精确包名、子进程归并、用户覆盖、缓存命中与安装变化后的失效。
- 游戏 → 桌面 → 游戏 → 日用 → 待机；锁屏、不同用户、画中画/多窗口残留和查询失败。
- 模拟四个 CPU policy 的实际频率上限从游戏档回到省电档，游戏 CPUSet 规则恢复为日用设置。
- 偏好保存失败不改变已确认的内存状态；重启/重装保留关闭状态和分类。
- 已保存自动开关与核心实际切换分别反馈，手动档原本就是极速也不会提前确认自动模式已应用。
- 外部 Scene 接管时保持暂停，自动开关与分类保持只读。

系统前台查询最长 750ms，输出最多 256KiB，每两秒最多查询一次。包分类查询各有一秒超时与 64KiB 输出限额；分类结果缓存十分钟，未知结果三十秒后重试。Scene 当前用户与安装查询分别有限时。时限不是实机延迟保证，切换仍取决于系统与内核响应。

## 安装等待

进度以六个真实阶段呈现，没有虚构百分比。等待提示在原有任务旁运行，任务结束立即终止提示进程，不在安装主流程加入等待。慢探测测试实际等待 3.2 秒，验证等待提示出现在下一阶段前。所有阶段输出追加到 `install-check.log`，并保留单阶段记录。

## 复现

```sh
npm ci --ignore-scripts
npm run test:webui
python3 scripts/test-installer.py
python3 scripts/generate-profiles.py --check
sh -n module-template/customize.sh
node --check module-template/webroot/assets/zen.js
ANDROID_NDK_HOME=/path/to/android-ndk-r27d CARGO=/path/to/cargo bash scripts/build.sh
python3 scripts/package-release.py
```

源代码包不包含工具链、node_modules、构建缓存、会话凭据或运行目录。

## 真机待验证

本次未执行 Android 真机刷入、WebView 实际渲染、功耗/温度/游戏帧率测试，也未量测不同 ROM 的前台查询时延。系统没有可验证游戏分类时会先省电，用户可通过 WebUI 修正。发布包是完成主机构建与回归的版本，不表示所有游戏与 ROM 均已经实测。

建议真机检查：卸载 Scene 后的安装提示；日用 → 游戏 → 回桌面/切应用 → 锁屏/解锁；分类修正与恢复自动；切手动档后重新启用自动；保留已有规则的覆盖升级；外部 Scene 接管与卸载恢复。

系统接口对照来源：

- [AOSP GameManagerShellCommand](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/app/GameManagerShellCommand.java)
- [AOSP Task 前台输出](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/wm/Task.java)
- [AOSP ApplicationInfo 分类与标记](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/content/pm/ApplicationInfo.java)
