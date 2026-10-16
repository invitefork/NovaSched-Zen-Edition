# v2.9.6：开机用户识别与解锁检查修复

作者：ZenJooo · versionCode：396 · 配置代际：380

## 日志确认的问题

开机入口已经运行，系统也已完成启动，但首次解锁检查持续报“无法查询 Android 当前用户”，没有进入 `start`。因此没有 `startup`、`daemon.identity` 或运行日志，WebUI 也没有可连接的守护。

本次修复针对启动门槛，不修改调频目标。守护未启动时，原诊断中的频率对比不能证明本模块已经下发策略；本版会明确提示配置尚未下发。

## 修改

- 平台查询由私有输出文件改为两条管道，标准输入置空；同时读取 stdout/stderr，限制输出大小和等待时间，超时终止该次查询的进程组。
- 当前用户支持 AOSP 的 `mCurrentUserId:`、已有等号格式和 `Current user:`；cmd/am 失败后，回退到用户摘要、用户服务、窗口策略和活动摘要。没有证据时不默认用户 0。
- 解锁检测支持完整 `[UserState: id=..., state=..., lastState=..., switching=...]`，核对当前用户和当前状态，不会误用上一状态或其他用户的解锁结果。保留 CE 属性和旧版数字/状态名，并增加备用查询。
- 查询失败保留具体命令与错误。开机入口减少重复日志，运行诊断增加 `[android-user]`。
- 保留 Scene 自动接管、原 LP 调度与初始化脚本备份、入口被重写后自动重新接管、卸载恢复和液态玻璃 WebUI。宿主桥延迟就绪和空异步返回的连接修复也保留。

旧日志未保留每条查询的底层错误，不能据此断言具体发生了哪条 SELinux 拒绝。本版不修改 SELinux 策略，也不绕过解锁与启动保护。

## 验证

原生回归覆盖用户字段格式、多用户冲突、完整 UserState、锁定状态、备用解锁路径、双管道大量输出、空标准输入、输出限额与超时回收；Scene 回归覆盖原 LP 内容和权限恢复、V1 备份升级与正式模块路径转换。

完整检查还覆盖 WebUI DOM/宿主通信、40 组处理器/档位配置、安装入口、启动等待和界面更新回滚。Android ARM64 核心使用 Rust 1.85.1 与 NDK r27d 静态构建，校验 16KB 段对齐、版本、作者、脚本权限和 ZIP CRC。

当前构建宿主没有 `/proc`，真实进程身份回归 1 项未运行；身份核验没有被移除。没有连接手机，仍需刷入后确认具体系统上的启动结果。

## 安装

覆盖刷入 `NovaSched-v2.9.6-release.zip` 并重启。首次解锁后等待约 30 秒，再打开 WebUI。保留 `/data/adb/novasched`，其中包含配置、原厂节点快照和 Scene 原件。

若仍离线，运行原来的 `novasched diagnose`，检查新增 `[android-user]` 与模块目录的 `boot-entry.log`。

参考：AOSP [UserController.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/am/UserController.java) 和 [UserState.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/am/UserState.java)。
