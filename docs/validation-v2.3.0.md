# v2.3.0 验证记录

日期：2026-10-13 · 版本：v2.3.0 / 版本代码 330 · 配置 schema 320（不变）

## 原生编译与 ELF

- 交叉编译：Windows 主机，NDK r29（`toolchains\llvm\prebuilt`），Rust 1.98，`aarch64-linux-android`，`--release --locked`，产物 1,539,640 字节。仅一条无害链接器告警（`-no-pie` unused）。
- ELF 检查（llvm-readelf）：
  - Class ELF64、Machine AArch64、Type EXEC。
  - 无 INTERP、无 NEEDED（全静态，无动态依赖）。
  - 全部 LOAD 段对齐 0x4000（16KB 页）。
  - 报告存于 `native/target-static/elf-{header,programs,dynamic}.txt`。

## 发布包

- `dist/NovaSched-v2.3.0-release.zip`（855,385 字节）与 `dist/NovaSched-v2.3.0-source.zip`（322,574 字节），`SHA256SUMS.txt` 同步生成。
- 打包断言全过：九份处理器 profile 一致性、module.prop/powercfg.json/Cargo.toml 版本三方一致（v2.3.0/330）、协议 KEY 与认证前缀与原生一致、ELF 与构建产物逐字节一致、可执行位、updater-script、无会话凭据泄漏、无 vendored 第三方分发。

## WebUI

- `scripts/test-glass-ui.cjs`：20 项全过（五页结构、前台包名与 Scene 诊断、无远程资源、认证协议与原生契约、Scene 优先级、弹窗可访问性、WebGL 降级与 reduced-motion、四档、九份 profile）。
- `scripts/test-webui-dom.cjs`：六种服务状态（联动/已安装/未知/外部接管/root 降级/无标签桥）DOM 交互全过，含导航、档位切换、规则增删改、诊断、主题、原始玻璃脚本集成。
- `scripts/verify-ui-render.cjs`（Playwright + Edge headless）：320/393/768px 五页无横向溢出，深浅主题切换，WebGL 玻璃渲染激活，四种服务状态与未知包名保留，页面无控制台错误。截图存 `ui-preview/`。
- v2.3.0 改动专项确认：
  - 关于页「共享存储日志镜像」开关渲染正常（默认关，深浅色均可读）；开关只操作 `/data/adb/novasched/sdcard-log`，与原生 `logging.rs` 读取同一路径。
  - 壁纸走 IndexedDB Blob（最长边 720px JPEG），localStorage 旧 base64 字段首次启动清除；jsdom/无 IndexedDB 环境静默降级。
  - 全部具名前端定时器走 Timers 表，页面隐藏 clearAll；root 备用通道轮询 4s。
  - fullPage 截图中固定元素（顶栏/dock/skip-link）出现在页中属 Playwright 拼接伪影；实测视口内 `top-bar=0`、`dock` 在底部、`skip-link=-100px` 视口外，无错位。

## 原生行为改动

- 息屏低功耗：`screen_on()` 读背光亮度，节点不可读按亮屏处理；息屏时前台扫描兜底 30s（`IDLE_FALLBACK`），亮屏恢复 2s。
- 守护进程 `nice 10 + SCHED_BATCH`（`setpriority` + `sched_setscheduler`，失败降级仅 nice）。
- 日志镜像：默认关；`sdcard-log` 标记文件每条日志前直接检查（修复了原型中"每 256 条才重读、开关延迟上百条日志"的缺陷），WebUI 开关下一条日志即生效；共享存储不可用时静默降级，权威日志不受影响。

## 已知限制与后续项

- 多用户/应用分身规则的 `userId` 支持未纳入本版：规则存储、前台 userId 识别和协议均需调度核心级改动，且无真机验证条件；列入 v2.3.1。
- 频率百分比按真机 `available_frequencies` 的吸附校准需要真机数据，保持待实测。
- 真机验证（WebView 实机渲染、功耗、息屏行为、安装流程）仍未进行；DOM/渲染测试使用合成服务状态，不能替代真机。
