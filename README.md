# NovaSched Zen Edition

作者：**ZenJooo** · 版本：**v2.7.0 / 370**

NovaSched 按设备实际 CPU 簇、频率表和内核能力设置四档策略，支持应用规则、Scene 联动，以及带壁纸和液态玻璃材质的 WebUI。v2.7.0 起内置自研 **NovaFAS 帧感知调度引擎**，读取前台应用的渲染帧信号，在档位包络内动态调频。

## 这次改了什么

- 界面重做：底部 dock 改为 概览 / 规则 / 日志 / 设置 四个平级页面，档位切换直接放在首屏；删除课程表式的装饰页头与二级详情栏，操作路径更短。
- 动画体系统一：页面切换双向转场，弹窗与面板从来源锚点展开、关闭按同一关键帧反向播放（从哪来就从哪回去），切换 Tab 保留各页滚动位置。
- 四档策略按功耗优先重调（9 款 SoC 各自的甜点表），修复极速档高频常驻导致的功耗失控（骁龙 8 Gen 3 打和平精英可达 10W 的问题）。
- 全新 NovaFAS 帧感知调度引擎；检测到 Scene 的 fas-rs 时自动接管（SIGSTOP 暂停、退出恢复）。
- WebUI 增加 NovaFAS 引擎卡：状态、帧信号来源、实时帧率与动态加压比例。

## 四档策略（功耗优先）

| 档位 | 定位 | 策略 |
|---|---|---|
| 省电 | 只推荐日用信息流 | 各簇上限压到 44–56%，无底频；输入法靠 15%/100ms 短脉冲保跟手，触控即省电档标准 |
| 均衡 | 剪映、AI 生产力 | 日用甜点（大核 58–62%），不拉大频率 |
| 性能 | 王者荣耀稳定 120 帧 | 按每颗芯片的 120 帧甜点分别配置（如 8 Gen 3 约 78–82%），仅 8% 底频 |
| 极速 | 原神、鸣潮类 3D 游戏 | 中/大核开放到 100%，小核 90–94%；高频由 NovaFAS 按帧需求动态给出，空闲即回落 |

NovaFAS 读取 SurfaceFlinger 帧统计（不可用时退回 GPU 负载启发式）：掉帧快速加压（top-app uclamp.min 与各簇最低频率），连续稳定后缓慢回落，把功耗压到"刚好够用"。所有动态写入都被限制在当前档位的频率包络内。配置 `features.fas` 可关闭引擎或改回 fas-rs 跟随模式。

目前支持 Snapdragon 8 Gen 1、8+ Gen 1、8 Gen 2、8 Gen 3、8 Elite、8 Elite Gen 5、Dimensity 8350、Dimensity 9400+、Xring O3。安装入口按能力兼容 APatch、KernelSU 系列与分支、Magisk 和 Alpha 系列；实际支持仍取决于内核和 WebUI 宿主接口。

## 安装

**`dist/NovaSched-v2.7.0-release.zip` 是可刷入的完整模块**（含 Android ELF）。在管理器中刷入后重启手机。覆盖安装保留档位、应用规则和自定义参数；未修改的默认配置随版本自动重调，更新前生成备份。

`NovaSched-v2.7.0-webui-update.zip` 可单独更新已安装模块的界面；解压后在 root 终端执行：

```sh
su -c 'sh /实际路径/scripts/install-webui.sh'
```

从源码构建需要 Rust 1.75+、`aarch64-linux-android` 标准库和 NDK r27d：

```sh
export CARGO=cargo
export ANDROID_NDK_HOME=/实际路径/android-ndk-r27d
bash scripts/build.sh
```

生成的 `dist/NovaSched-v2.7.0-release.zip` 才是可安装模块。

## 检查与诊断

```sh
bash scripts/validate.sh
cargo test --manifest-path native/Cargo.toml
node scripts/test-glass-ui.cjs
node scripts/test-webui-dom.cjs
node scripts/check-profiles.cjs
```

Rust 测试与 Android 构建由 GitHub Actions 在 Linux 上执行；DOM 与渲染调度回归使用模拟宿主，不能代替真机的铺屏、功耗或帧率测试。真机验证关注点：NovaFAS 的 timestats 帧信号在部分 ROM 上可能被 SELinux 拒绝（自动退回启发式并在引擎卡注明）、省电档输入法跟手度、极速档功耗曲线。

完整安装后可在 root 终端读取 FAS 状态：

```sh
su -c '/data/adb/modules/NovaSched_Zen_Edition/bin/novasched fas-diagnose'
```

## 来源与许可

作者为 ZenJooo。调度核心使用 GPL-3.0-only。液态玻璃保留 Kyant Backdrop 的 WebGL 移植、Apache-2.0；素材和来源保留在 `NOTICE`。测试依赖 LinkeDOM 使用 ISC。
