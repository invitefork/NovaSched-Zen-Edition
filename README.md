# NovaSched Zen Edition

作者：**ZenJooo**。当前版本：**v2.6.0 / 360**。

根据处理器和内核能力调整 CPU 策略，提供省电、均衡、性能、极速四档，支持应用规则、Scene 联动和原厂节点恢复。作者为 **ZenJooo**。

本次 WebUI 对照用户提供的 SleepDown 课程表 `1.2.7_beta5` 与 APK 对应的构建源码重做。页面采用三项浮动导航、分区卡片、个性化面板和壁纸取景，调度功能仍由 NovaSched 执行。玻璃透镜和色散使用 Kyant Backdrop 公式的 WebGL 移植；APK 的原生 Compose / RuntimeShader 不能直接装入 WebView，不能把本版称为同一原生引擎或已经逐像素一致。完整改动、验证与边界见 [WebUI 改造说明](docs/webui-sleepdown-beta5.md)。

所有设备端资源随包提供，无需联网加载。
## 安装与更新

`source.zip` 是源码，不能作为完整模块安装包刷入。本次没有编译或替换原生守护进程。

已有 v2.2.8 模块时，可将解压后的整个源码文件夹放到设备，在 root 终端运行 `sh /实际路径/NovaSched-Zen-Edition/scripts/install-webui.sh` 更新 WebUI。脚本检查已安装模块并自动备份旧界面，更新后关闭页面再重新打开即可。

需要完整安装包时，按下面的构建流程生成 `release.zip`，在 root 管理器中安装后重启手机。已有有效配置、应用规则和自动调度偏好会保留。

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

「今日」显示实际档位、前台应用和调度来源；「调度」切换四档与本地自动模式；「设置」进入应用规则、运行记录、个性化和模块信息。右下角加号与顶部菜单提供快捷入口。应用规则支持搜索、编辑和左滑删除；日志支持过滤、跟随与复制。

个性化支持壁纸模糊和亮度、横竖屏独立取景、卡片配色和材质、折射、色散以及深浅模式。设置拖动时实时预览，松手保存。

本次性能修正将加号与导航放在同一行，共享底部安全区；滚动内容在固定顶栏下方裁切。玻璃表面、浮层文字与背景纹理按变化更新，复用 WebGL 绘制缓冲，限制背景采样尺寸和纹理缓存内存。实现与验证见 [性能与布局修正](docs/webui-performance-dock.md)。

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
npm run test:performance
python3 scripts/test-installer.py
```

常规 Linux 主机可以设置 `CHROME` 指向 Chromium，再运行 `npm run test:render` 做 320、393、768px 的截图和交互检查。安装 Mesa EGL 的 Linux 主机还可运行 `npm run test:shader` 对比移植着色器与 APK 的透镜和色散公式。

本次 WebUI 验证见 `docs/webui-sleepdown-beta5.md`、`docs/webui-performance-dock.md` 与对应结果文件。六组 DOM 场景、20 项静态检查、绘制缓存回归、更新与回滚检查和软件 GPU 数值比对通过。当前环境未完成浏览器截图比对，也未连接设备实测。既有原生与安装脚本验证记录保留在 `docs/validation-v2.2.7.md`，不作为本次 UI 的像素验证。
模块 ELF 为 AArch64 静态可执行文件，不需要动态解释器或共享库，LOAD 段按 16KB 对齐。

## 许可与来源

模块作者为 ZenJooo，调度核心沿用 GPL-3.0-only。WebGL 透镜和色散公式来自 Kyant Backdrop，Apache-2.0；界面参考 SleepDown-Schedule，原作者 xiaomanjun233，构建提交与素材来源见 `NOTICE`。测试依赖 LinkeDOM 使用 ISC。模块不是 SleepDown 官方版本，保留了应用内的来源与许可入口。
