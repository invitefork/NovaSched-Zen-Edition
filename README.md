# NovaSched Zen Edition

作者：**ZenJooo** · 版本：**v2.9.0 / 390**

NovaSched 根据设备的 CPU 簇、频率范围和内核接口设置四档策略，支持应用规则、Scene 联动和液态玻璃 WebUI。NovaFAS 接管 Scene FAS/FEAS/FAS Lite 的职责，按前台应用的帧信号动态调频；三星自动使用保守策略。

## 本版修订（v2.9.0）

- **触感适配层**：语义化触感（选择/开关/刻度/成功/失败），如实降级（宿主原生桥 → 设备振动 → 无），设置页可开关；底部导航/档位/开关/滑块全接入。
- **云端更新**：设置 → 检查更新，从 GitHub Release 直连+镜像回退下载，SHA256 校验后按环境自动安装，重启生效。
- **安装向导重制**：六幕动画安装，处理器识别结果与配套配置模板安装时明示。
- 导航交互打磨：按压压缩反馈、点按/拖拽职责分离、快速切页不排队。
- 修复概览实时频率单位错误；WebUI 回归扩至 22 场景全过。

完整改动与兼容性表见 [修复说明](docs/fix-v2.9.0.md)；v2.8.0（SM8650 真机 OPP 逐档、NovaFAS HyperOS 实测重写、通知栏突发）见 [docs/fix-v2.8.0.md](docs/fix-v2.8.0.md)。

## 四档策略

| 档位 | 适用场景 | 主要作用 |
|---|---|---|
| 省电 | 消息、信息流、轻量日用 | 降低各簇频率上限 |
| 均衡 | 日常多任务 | 兼顾响应和功耗 |
| 性能 | 持续负载、常规游戏 | 提高可用频段，保留少量底频 |
| 极速 | 大型游戏 | 开放更高上限；可用时由 NovaFAS 动态加压 |

效果取决于负载、内核和温控。三星保守策略下，四档仍能切换 CPU 频率范围，NovaFAS、输入加速、uclamp 与其他额外控制暂停。

默认 auto 在骁龙的性能/极速档优先 walt（内核实际提供时），省电/均衡与天玑/玄戒保留内核原厂动态调速器。WALT 只有在内核实际提供时才能使用；本模块不会给内核添加调速器。三星始终优先原厂值。

目前支持 Snapdragon 8 Gen 1、8+ Gen 1、8 Gen 2、8 Gen 3、8 Elite（含领先版等字母后缀 bin）、8 Elite Gen 5、Dimensity 8350、Dimensity 8400（含 8400-Ultra）、Dimensity 9400+、Xring O3。三星保守策略适用于这些已支持处理器的三星设备，不含 Exynos。安装入口按能力处理 APatch、KernelSU 及兼容分支、Magisk 与 Alpha 等兼容分支；实际运行依赖内核接口，WebUI 依赖宿主。

## 安装

**`dist/NovaSched-v2.9.0-release.zip` 是可刷入的完整模块，包含 Android ARM64 静态核心。** 在 root 管理器中安装后重启，首次解锁后等待 30 秒。更新保留有效档位、应用规则与自定义配置；未编辑过的默认配置自动重调至代际 380。

源码包用于开发。WebUI 更新包只更新界面，解决安装和启动问题必须使用完整 release 包。

若旧版已经循环重启，应先停用旧模块再更新。启动保护导致停用时，先查看记录再显式重新启用。

## 构建与检查

需要 Rust 1.75+、aarch64-linux-android 标准库和 Android NDK r27d：

```sh
export CARGO=cargo
export ANDROID_NDK_HOME=/实际路径/android-ndk-r27d
bash scripts/build.sh
bash scripts/validate.sh
```

构建脚本运行原生测试，再生成 ARM64、静态链接、16KB 页面对齐的模块包。检查结果见 [验证记录](docs/validation-v2.7.2.txt)。本地模拟检查不等于真机安装、帧率或功耗验证。

## 诊断

安装失败日志：`/data/adb/novasched/install-last.log`。运行日志：`/data/adb/novasched/novasched.log`。启动入口日志位于模块目录，启动保护记录位于运行目录的 boot-guard。

```sh
su -c '/data/adb/modules/NovaSched_Zen_Edition/bin/novasched diagnose'
```

启动异常请同时提供机型、系统与管理器版本，以及 pstore 或设备保留的上一轮内核记录。不要为排查直接删除运行目录，里面含配置和原厂快照。

## 来源与许可

作者为 ZenJooo。调度核心使用 GPL-3.0-only。液态玻璃保留 Kyant Backdrop 的 WebGL 移植、Apache-2.0；素材和来源记录在 NOTICE。测试依赖 LinkeDOM 使用 ISC。
