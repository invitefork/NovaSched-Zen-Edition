# v2.5.0 验证记录

日期：2026-10-13 · 版本：v2.5.0 / 版本代码 350 · 配置 schema 320（不变）

## 技术栈重构（用户指定的三个开源项目）

| 项目 | 版本 | 用途 | 许可 |
|---|---|---|---|
| Kyant0/AndroidLiquidGlass | 2.0.1 | 液态玻璃折射管线（Backdrop + lens + highlight），与参考 APK 同款库 | Apache-2.0 |
| Kyant0/shapes（同作者） | 1.2.1 | G2 连续曲率 RoundedRectangle / Capsule | Apache-2.0 |
| compose-miuix-ui/miuix | 0.9.4 | HyperOS 风格开关 / 滑杆组件 | Apache-2.0 |
| ShiGuangSchedule/shiguang_warehouse | — | 随 assets 内置的参考应用同源数据资产（3.5MB） | 见其 LICENSE |

署名已写入 NOTICE；本模块其余部分保持 GPL-3.0-only。

## 构建链

- AGP 9.3.2（内建 Kotlin，`org.jetbrains.kotlin.android` 已移除）+ Kotlin 2.4.10 + Gradle 9.8.1 + compileSdk 37（backdrop/miuix 依赖树 AAR 元数据强制要求 minCompileSdk=37、Compose 1.12 强制 AGP≥9.1；android-37 平台以 platform-37.0_r02.zip 手动安装，修正其 source.properties 中带小数点的 ApiLevel 后被 AGP 识别）。
- targetSdk 36 / minSdk 33 不变（与参考 APK 的 targetSdk 一致）。
- assembleDebug 与 assembleRelease（R8 + 既有 keystore 签名）均通过；release APK 3,423,754 字节（含 shiguang_warehouse 资产）。
- 应用图标：用户提供的插画 → 自适应图标（前景 62% 安全区、纯白背景、含 monochrome）+ mdpi~xxxhdpi legacy mipmap，Manifest 已挂 @mipmap/ic_launcher。

## 代码变更范围

- `ui/glass/GlassFx.kt` 重写：rememberLayerBackdrop + Modifier.layerBackdrop（背景折射源）+ drawBackdrop{blur(10u); lens(26u,30u,色散)} + Highlight(0.5u)；GPU 不支持 RuntimeShader 时降级半透明玻璃色 + 描边（isRuntimeShaderSupported 判定）。
- Components.kt 全部玻璃面（卡片/胶囊钮/档位卡/弹窗/动作钮/Snackbar/输入框）切换 novaGlass；开关 NovaSwitch 委托 miuix Switch。
- ProfilesPage 频率滑杆切换 miuix Slider。
- MainActivity 增加折射源背景层（渐变 + 强调色光斑，novaBackdropSource）。
- 守护进程、协议层（NovaSocket/RootShell/NovaViewModel）无行为变更；仅版本号随版本升级（2.5.0）重编。

## 原生复检

- AArch64 静态 ELF：INTERP=0 / NEEDED=0 / LOAD 0x4000 全对齐；二进制含 2.5.0 版本串与 JSON API 字符串（字节级校验）。
- 打包 23 项断言全过（module/gradle/Cargo 三方版本一致、APK 逐字节一致、webroot 不存在、强制安装命令齐备、回环契约）。

## 已知限制与后续项

- 真机验证仍未做：图标/玻璃质感装机确认、31416 端到端联调、开机强制安装实测。
- 规则 userId 存储层、set_config 写入开放（沿用 v2.4.0 记录）。
