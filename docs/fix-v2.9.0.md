# v2.9.0 修复说明：触感适配层、导航交互打磨、云端更新与安装向导重制

作者：ZenJooo · 2026-10 · versionCode 390 · 配置代际 380

## 1. 触感适配层（haptics.js）

独立的语义触感层，业务代码只表达意图（select / toggle / tick /
success / failure / warning），不接触原生参数。

**调研结论（如实说明）**：逐一核实 KSU / Magisk / Alpha / APatch /
MMRL 的公开 WebUI API——MMRL 的 WebUI-API 提供 Toast、FileSystem、
版本信息等接口，**没有任何宿主文档化触感接口**。Android 原生的
`performHapticFeedback` 不能被网页直接调用，必须由宿主 App 注入桥。
因此降级顺序为：

1. **宿主原生触感桥**（预留约定）：宿主注入 `window.NovaHostHaptics`
   函数（入参为语义字符串）即自动启用并优先。当前无宿主注入 = 能力
   缺失，如实降级；需要宿主配合的部分即在宿主侧新增这一桥接。
2. **navigator.vibrate**：用户开启触感且环境支持时使用；WebView 的
   振动依赖宿主 App 的 VIBRATE 权限。
3. **无触感**。

- 系统触感总开关关闭时，Android 会静默拒绝振动；网页**无法读取系统
  触感设置**，表现为无振动，模块把它当终点，不再用其它通道补震。
- 不通过 root shell 执行振动命令。
- 设置 → 外观新增「触感反馈」开关（localStorage 持久化），并如实显示
  当前通道（宿主原生 / 设备振动 / 当前宿主未提供触感能力）。
- 页面进入后台（document.hidden）停止一切触发；同语义最小间隔限频，
  避免连点把振动排成队列。

## 2. 底部导航交互细节

- **按压反馈**：pointerdown 后下一帧给轻微压缩（`transform: scale(.97)`，
  只动 transform；`prefers-reduced-motion` 下关闭），点击区域不变。
- **职责分离**：拖拽换页在 pointerup 提交（坐标换算）；原地点按交给
  按钮自身的 click 事件。绝不用坐标推断覆盖真实命中目标——开发中曾
  把两者合并导致点按落在错误分格，回归测试
  （tap/drag separation 场景）当场抓住并回退。
- **统一入口** `switchPageWithHaptic`：有效切换一次 select 触感；点击
  当前页只给一次轻 tick 并保留页面状态与滚动位置；禁用/取消/滚动误触
  不触发。拖拽后的 click 被限窗吞掉，一次操作不会双触发。
- 快速连续切页：动画从当前位置转向最新目标（既有 animate 实现），
  旧异步结果不会覆盖新状态（revision/epoch 门卫保持）。
- pointercancel / 移出正确恢复，无残留按压态。

## 3. 云端更新（设置 → 检查更新）

`bin/cloud-update.sh`（root 执行）+ WebUI 状态流：

1. **检查**：GitHub Releases latest（`api.github.com`）→ 解析 tag 与
   release.zip / SHA256SUMS 资产地址。
2. **下载**：直连 → gh-proxy.com → ghfast.top → gh.llkk.cc 自动回退；
   优先 curl（HyperOS 内置），回退 wget（toybox，不带 GNU 参数）。
3. **校验**：包体积下限 + SHA256 与 SHA256SUMS 比对，不符即删除。
4. **安装**：按环境选择 `ksud module install` / `apd module install` /
   `magisk --install-module`，写入 modules_update，重启生效。
5. **状态**：每行 KEY=VALUE 约定（CURRENT/LATEST/UPDATE_OK/
   UPDATE_FAIL/MANAGER），WebUI 呈现检查 → 发现新版 → 下载校验安装 →
   重启提示全流程；无 curl/wget、断网、校验失败、无管理器 CLI 都有
   明确中文报错，并提供「打开 Release 页」手动兜底。

## 4. 安装向导重制（customize.sh）

六幕动画：开场 banner → 转轮 spin（◐◓◑◒）→ 12 格进度条逐幕推进
（33% → 58% → 75% → 92% → 100%）。逻辑同步加固：

- **第三幕明示处理器识别结果与配套配置模板**（soc=/profile=/soc_id=
  从 probe 输出取回并显示），"所有处理器刷入对应配置"在安装时可见。
- 新增前置硬校验：`bin/novasched` 缺失/不可执行时立即中止（此前只会在
  自检阶段报出难懂的错误）。
- `bin/cloud-update.sh` 随安装设置 0755。
- Scene 检测幕新增"建议关闭 Scene 内 FAS/调度，交给 NovaFAS"提示。
- 动画帧间隔 0.12s、每幕 3–4 帧，整体增加约 8 秒；`NOVA_ANIM_DELAY`
  环境变量可调。
- 保留全部既有硬性逻辑：arm64 准入、旧模块冲突检测、run_check 票据
  退出码、失败日志固定保留（install-last.log）、三星策略提示。

## 5. Bug 修复（本轮审查发现）

- **概览实时频率单位错误**：守护进程下发 kHz，界面按 MHz 除法，显示
  成"1459.20 GHz"。修正为 ÷1,000,000；DOM 回归覆盖（1.46/1.82 GHz）。
- 开发中发现的导航点按/拖拽合并缺陷（见第 2 节），被既有回归抓住。
- 旧 `haptic()` 直调 navigator.vibrate(7) 的散落调用统一收编进语义层。

## 6. 测试与兼容性

自动化（本机实际执行）：

- WebUI DOM 回归 **22 场景全 PASS**（新增 4 个：引擎遥测 GPU/心跳、
  实时频率+触感开关持久化、触感通道优先级+导航语义+总开关、更新入口
  与弹窗）；tap/drag 分离、宿主边距、返回键弹层等既有场景保持全过。
- glass-ui 25 项、glass-performance 8 项、check-profiles 10 模板
  字节级、`cargo check --target aarch64-linux-android --all-targets`
  零警告——全部通过。
- Release 打包器校验（CRC/元数据/可执行位/ELF 静态+16KB 对齐）通过。

**未执行/未测试（如实声明）**：

- 浏览器截图/录屏与真机触感手感：需要交互式环境与真机，本轮未采集；
  自动化只能断言触感调用发生，实际手感需真机确认。
- 真机安装/云端更新端到端：下载、镜像回退与三家管理器安装命令逻辑
  已按文档实现，但未在真机完整走通（需 root 授权与真实网络环境）。
- 云端更新的国内镜像可用性随时间变化，若全部回退失败请用「打开
  Release 页」手动下载。

### 兼容性测试表

| 环境 | Android | 宿主 | 状态 |
| --- | --- | --- | --- |
| 小米 14（houji） | HyperOS / Android 16 | （宿主未定，模块未刷入） | 真机 SoC 数据采集✅；WebUI/触感**未测试** |
| DOM 合成宿主（linkedom） | — | 模拟 KSU exec + WebSocket | 已通过（22 场景） |
| APatch | — | apd WebUI | 未测试 |
| KernelSU 及分支 | — | ksu WebUI | 未测试 |
| Magisk / Alpha | — | Magisk WebUI | 未测试 |
| MMRL / WebUI X | — | mmrl | 未测试（触感桥未文档化，已如实降级） |

差异处理：所有宿主差异通过能力检测（exec 签名协商、桥存在性、
vibrate 支持性）在运行时处理，不按宿主名称分支。
