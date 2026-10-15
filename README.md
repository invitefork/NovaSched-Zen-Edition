# NovaSched Zen Edition

作者：**ZenJooo** · 版本：**v2.8.0 / 380**

NovaSched 根据设备的 CPU 簇、频率范围和内核接口设置四档策略，支持应用规则、Scene 联动和液态玻璃 WebUI。支持的设备上，NovaFAS 接管 Scene FAS/FEAS/FAS Lite 的职责，按前台应用的帧信号动态调频；三星自动使用保守策略，暂停额外调度控制。

## 本版修订（SM8650 全部按小米 14 真机 OPP 逐档实测）

- SM8650 四档逐频点重调：省电 1459/1613/1498/1824 MHz（低功耗且不卡）、均衡 1805/2131/2035/2246、性能（王者 120 帧甜点）1920/2630/2496/2688、极速（游戏专用）全频段 2150/3149/2957/3302。
- NovaFAS 帧信号解析按 HyperOS/Android 16 真机数据重写（packageName/layerName 双路归属），正式接管 Scene FAS/FEAS/FAS Lite 的职责；通知栏/超级岛在省电均衡档也不再卡（SystemUI 突发借用 + 触摸 0.1 秒快通路）。
- WebUI 新增各簇实时频率与引擎实时数值（帧率/GPU/心跳）；首次欢迎弹窗与「请作者喝杯奶茶」捐赠入口（完全自愿）。
- 处理器识别支持 SM8750P 等字母后缀 bin 与"领先版"命名；新增天玑 8400 / 8400-Ultra。
- 其余：均衡档贴近省电档、NovaFAS 引擎自愈、节点漂移降噪、骁龙性能/极速 walt 优先——详见 [修复说明](docs/fix-v2.8.0.md)。

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

**`dist/NovaSched-v2.8.0-release.zip` 是可刷入的完整模块，包含 Android ARM64 静态核心。** 在 root 管理器中安装后重启，首次解锁后等待 30 秒。更新保留有效档位、应用规则与自定义配置；未编辑过的默认配置自动重调至代际 380。

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
