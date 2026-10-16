# NovaSched Zen Edition

作者：**ZenJooo** · 版本：**v2.9.6 / 396**

NovaSched 根据 CPU 簇、可用频率和内核接口执行四档策略，支持应用规则、NovaFAS 帧感知调度与液态玻璃 WebUI。

## 本版修复

修复开机入口反复提示“无法查询 Android 当前用户”、核心一直未启动的问题。查询改用管道，支持 AOSP 当前用户字段和完整 UserState 输出，并为用户识别与首次解锁增加备用查询。保留首次解锁和启动保护，失败时显示具体原因。

检测到 Scene 后，备份原 LP 调度和初始化脚本，再由 NovaSched 接管其入口；入口被 Scene 重写后重新注册。Scene 提供档位和应用规则，NovaSched 核心执行下发。首次备份保留，卸载时恢复。没有安装 Scene 时，由 WebUI 管理本地调度。

WebUI 保留液态玻璃外观，补齐宿主桥延迟就绪、异步空返回、连接错误展示及服务补启动。停用、卸载和连续失败的服务不会被界面反复拉起。

## 四档

| 档位 | 适用场景 | 作用 |
| --- | --- | --- |
| 省电 | 消息、阅读、轻量日用 | 限制各簇频率上限 |
| 均衡 | 日常多任务 | 兼顾响应与功耗 |
| 性能 | 持续负载、常规游戏 | 提高可用频段 |
| 极速 | 大型游戏 | 开放更高上限，由可用 NovaFAS 信号动态调节 |

具体效果取决于内核、负载和温控，不保证特定帧率或功耗。三星采用保守策略，保留原厂调速器，暂停 NovaFAS 与额外控制，四档 CPU 范围仍可切换。

安装入口按能力兼容 APatch、KernelSU 及兼容分支、Magisk/Alpha 及兼容分支；未逐一真机测试所有管理器。Magisk/Alpha 没有内置 WebUI 时，可通过 KsuWebUI 或 MMRL 并授权 root/Shell 打开。

## 安装

覆盖安装 **`dist/NovaSched-v2.9.6-release.zip`**，然后重启。首次解锁后等待约 30 秒，打开模块 WebUI；安装了 Scene 时应显示“NovaSched 已接管 Scene”。Scene 若仍缓存旧名称，完整退出后重新打开。

源码包用于开发，WebUI 更新包只更新界面。修复本次启动问题需使用完整 release 包。不要删除运行目录；覆盖更新保留配置与规则。

## 诊断

离线时点状态卡 → 读取诊断，也可运行：

```sh
su -c '/data/adb/modules/NovaSched_Zen_Edition/bin/novasched diagnose'
```

`[android-user]` 显示当前用户、CE 属性和解锁检查；模块目录的 `boot-entry.log` 记录启动门槛。运行目录 `/data/adb/novasched` 保存运行日志、配置、原厂快照和 Scene 备份。

## 构建

需要 Rust 1.75+、aarch64-linux-android 标准库及 Android NDK r27d：

```sh
export CARGO=cargo
export ANDROID_NDK_HOME=/实际路径/android-ndk-r27d
bash scripts/build.sh
bash scripts/validate.sh
```

构建校验 Android ARM64 静态核心、16KB 段对齐、包内执行权限与版本一致性。自动化检查不等于手机上的启动、帧率与功耗测试。见 [v2.9.6 修复说明](docs/fix-v2.9.6.md)。

## 来源与许可

作者为 ZenJooo，调度核心使用 GPL-3.0-only。液态玻璃保留 Kyant Backdrop 的 WebGL 移植，Apache-2.0；素材和来源记录在 NOTICE。测试依赖 LinkeDOM 使用 ISC。
