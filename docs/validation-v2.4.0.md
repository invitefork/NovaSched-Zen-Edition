# v2.4.0 验证记录

日期：2026-10-13 · 版本：v2.4.0 / 版本代码 340 · 配置 schema 320（不变）

## 形态变更

- WebUI（module-template/webroot）已移除；控制面为模块内置的 NovaSched Compose 应用。
- release.zip 新增 `app/NovaSched.apk`（2,149,095 字节，R8 收缩 + release 签名）。

## 原生（AArch64 静态 ELF）

- 交叉编译：NDK r29 `toolchains\llvm\prebuilt`，`--release --locked`，产物 1,595,512 字节，嵌入 v2.4.0 版本串与 JSON API（字节级校验）。
- ELF 检查：ELF64 / AArch64 / EXEC；无 INTERP（0）、无 NEEDED（0）；全部 LOAD 段 0x4000（16KB）对齐。中途发现一次未带静态标志的产物混入（INTERP=1），已用完整 RUSTFLAGS 重编并复检归零。
- 新增 `jsonapi.rs`：固定 127.0.0.1:31416 JSON WebSocket。编译期验证通过；指令面：get_status / set_profile / set_auto / get_rules / set_rule / delete_rule / get_config / set_config / reset_config / stream_logs / clear_logs。
- 接入 daemon.rs：非致命启动（绑定失败仅告警），停止时与 WebUI 线程同等 join。
- 复用 websocket.rs 帧处理（read_frame/send_frame/send_control 已 pub(crate)）与 payload() 状态聚合；日志行守护侧解析为 {time,level,message}。

## Compose 应用

- 构建：AGP 8.7.3 / Kotlin 2.0.21 / Compose BOM 2024.12.01，minSdk 33 / targetSdk 36（与参考 APK targetSdk 一致），versionCode 240。
- assembleDebug 与 assembleRelease（R8 + 自签名 keystore app/keystore/novasched-release.keystore，随源码分发保证覆盖安装签名一致）均通过。
- 模块嵌入校验：release.zip 内 `app/NovaSced.apk` 与 gradle 产物逐字节一致；模块 23 项发布断言全过（含 webroot 必须不存在、service.sh/customize.sh 必须含强制安装、APK 必须回环契约）。
- shell 语法检查：service.sh / customize.sh / uninstall.sh 全部 `sh -n` 通过。
- 源码包：app/ 23 个源文件 + Gradle wrapper + keystore，无 build/.gradle/local.properties 混入（逐条目核验）。

## 安全与契约

- APK 仅声明 INTERNET 权限（Android 对 127.0.0.1 回环 socket 亦要求），无任何外网端点；WebSocket 主机硬编码 127.0.0.1:31416。
- APK 无 /sys 访问、无 shell 调度逻辑；root 三用途（su 检测/守护拉起/日志导出）。
- JSON API 按契约不认证，回环外不可达；指令面收敛为调度控制（无 shell、无文件写入），已在源码注释与本记录中留痕。
- 配置写入（set_config/reset_config）明确返回"下版开放"，不做假成功。

## 已知限制与后续项

- 真机验证未做：APK 装机、像素级比对参考 APK、开机强制安装实测、31416 端到端联调均需真机。
- 规则 userId：守护进程存储仍为纯 package 键（v2.3.1 遗留），JSON API 规则载荷 userId 固定 0；应用分身/多用户规则待存储层改造。
- set_config/reset_config 待配置管线接入后开放写入。
- 参考应用为 SleepDown-Schedule 开源项目（UI 规格提取自其公开仓库与 APK 资源）；NovaSched 未复制其业务代码。
