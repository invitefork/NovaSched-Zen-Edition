# NovaSched Zen Edition

作者：**ZenJooo**。当前版本：**v2.2.8 / 328**。

根据处理器和内核能力调整 CPU 策略，提供省电、均衡、性能、极速四档。支持应用规则、Scene 联动和原厂节点恢复。WebUI 的布局与液态玻璃材质按 [SleepDown-Schedule](https://github.com/xiaomanjun233/SleepDown-Schedule) 实机 UI 复刻（日期块顶栏、助手卡、分区课程卡、胶囊 dock、个性化面板与壁纸玻璃），渲染核心为移植自 LiquidGlassView（基于 QmDeve/AndroidLiquidGlassView，MIT）的 WebGL 折射着色器。所有运行资源均随模块提供，无需联网加载。

## 安装与更新

在 root 管理器中安装 `NovaSched-v2.2.8-release.zip`，覆盖更新后重启手机。已有有效配置、应用规则和自动调度偏好会保留。`source.zip` 是源码，不是安装包。

支持 ARM64。安装不按管理器品牌或版本号拦截；Magisk（含 Alpha）、KernelSU 系列与 APatch 使用相同的模块入口。没有内置 WebUI 的管理器需要独立 WebUI 宿主，并授予其 root / Shell 权限。具体分支仍取决于它是否提供标准模块安装、启动和命令接口。

支持的处理器：骁龙 8 Gen 1、8+ Gen 1、8 Gen 2、8 Gen 3、8 Elite、8 Elite Gen 5，天玑 8350、9400+，玄戒 O3。实际 CPU policy、频率范围和调速器由设备探测，硬件不支持时会给出原因。

## Scene 联动

主要检测包名为 `com.omarea.vtools`。检测按当前 Android 用户查询，依次尝试 `cmd`、`pm` 的安装列表和 APK 路径；服务不可用时核对系统安装记录，并尽可能检查逐用户的卸载与隐藏状态。旧数据目录和进程名称不作为安装证据。

重启后，模块在确认 Scene 安装时尝试注册 `/data/powercfg.sh` 和 `/data/powercfg.json`。已有其它调度器的回调不会被覆盖。WebUI 的 Scene 卡片区分：

- Scene 联动中：Scene 决定档位，NovaSched 执行策略；本地自动调度暂停，偏好保留。
- 外部调度器接管：NovaSched 暂停节点写入，档位和规则只读。
- Scene 已安装、待注册：可在「Scene 检测详情」查看原因并重新注册。
- WebUI 接管：未安装 Scene，本地自动模式或应用规则生效。
- 检测暂不可用：系统未返回可靠结果，服务会继续检测。

Scene 的 `powersave`、`balance`、`performance`、`fast` 回调，以及 `pedestal`、`standby` 动作沿用现有接口。FAS 模式节点存在时同步档位，不要求安装 FAS 才能使用模块。

## WebUI

概览显示实际档位、前台应用、包名和调度来源；档位页切换四档与本地自动模式；规则页添加、修改、删除应用规则；日志页按需连接并提供过滤与复制；关于页提供版本、配置、深浅主题、强调色和玻璃强度。

前台应用每两秒尝试读取 ActivityManager，并在需要时读取 WindowManager、activity top 和多个 top-app 分组。不依赖本地自动模式是否开启。宿主没有应用名称接口时直接显示包名，不再显示泛泛的「未知应用」。

WebUI 的命令、WebSocket 和 root 备用通道保留会话认证和准确的页面来源校验。连接成功后才开放控制，实际读回确认后才显示操作完成。

## 排查 Scene

先覆盖安装并重启，再打开 WebUI → 概览 → Scene 检测详情。也可以在 root 终端执行：

```sh
su -c /data/adb/modules/NovaSched_Zen_Edition/bin/novasched scene-diagnose
```

诊断会显示模块与二进制版本、安装检测证据、当前回调和联动状态。如果显示外部调度器接管，先在原调度模块或 Scene 中处理现有调度源，再重新检测。

日志位于 `/data/adb/novasched/novasched.log`；开机入口记录位于同目录的 `boot-entry.log`；安装记录位于模块目录的 `install-check.log`。

## 构建与验证

需要 Rust 1.75 以上、`aarch64-linux-android` 标准库与 Android NDK r27d。

```sh
export CARGO=/path/to/cargo
export ANDROID_NDK_HOME=/path/to/android-ndk-r27d
bash scripts/build.sh
npm ci
npm run test:webui
python3 scripts/test-installer.py
```

常规 Linux 主机可以设置 `CHROME` 指向 Chromium，再运行 `npm run test:render` 做 320、393、768px 的截图和交互检查。

本次原生回归、安装脚本和 DOM 交互验证见 `docs/validation-v2.2.7.md`。当前构建环境无法启动 Chromium，未完成像素级截图检查，也未连接用户设备实测。DOM 测试使用合成服务状态、尺寸和 Canvas，不能替代真机 WebView 验证。

模块 ELF 为 AArch64 静态可执行文件，不需要动态解释器或共享库，LOAD 段按 16KB 对齐。

## 许可与来源

模块作者为 ZenJooo，核心沿用 GPL-3.0-only；原有调度核心来源见 `NOTICE`。WebUI 的液态玻璃渲染器移植自 LiquidGlassView（AndroidLiquidGlassView 的 WebGL 单文件版），上游项目 QmDeve/AndroidLiquidGlassView 为 MIT 许可；布局节奏与胶囊 dock 借鉴 xiaomanjun233/SleepDown-Schedule 的设计语言，未复制其代码。渲染器源码位于 `module-template/webroot/assets/liquid-glass.js`，无 vendored 第三方分发文件。
