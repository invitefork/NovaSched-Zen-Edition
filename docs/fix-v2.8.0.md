# v2.8.0 修复说明：真机逐频点调优、NovaFAS 全链路实测与捐赠支持

作者：ZenJooo · 2026-10 · versionCode 380 · 配置代际 380

本版本的全部调优与修复都基于一台真机的实测数据：小米 14（houji，
骁龙 8 Gen 3 / SM8650，HyperOS / Android 16），经 adb 采集 OPP 频率表、
调速器列表与 SurfaceFlinger timestats 真实输出。

## 1. SM8650 四档按真机频点逐档重调

真机 OPP 上限：小核簇 2265.6 MHz、中核簇（3×A720）3148.8、大核簇
（2×A720）2956.8、超大核 X4 3302.4。模板里的百分比会向下吸附到最近
的真实频点，本版直接按目标频点反推百分比：

| 档位 | 模板值 | 实际频点 (MHz) | 定位 |
| --- | --- | --- | --- |
| 省电 | 65/52/51/56% | 1459/1613/1498/1824 | 日用低功耗；小核放宽到 1.46G 保 SystemUI/信息流不卡，三个大簇压在 1.5–1.8G |
| 均衡 | 80/68/69/69% | 1805/2131/2035/2246 | 日用甜点，重一点的剪辑/多任务也稳 |
| 性能 | 85/84/85/82% | 1920/2630/2496/2688 | 王者荣耀 120 帧甜点，8% 底频 |
| 极速 | 95/100/100/100% | 2150/3149/2957/3302 | 游戏专用：原神/鸣潮全频段，动态部分交给 NovaFAS |

要点：

- **极速只做游戏**：档位说明与欢迎弹窗都注明"游戏专用，日用选均衡"。
- **省电不再是"能跑就行"**：旧省电小核只有 1178 MHz，HyperOS 下信息流
  和通知动画就是会卡；新省电把小核放到 1459 MHz，配合 SystemUI 突发
  （见第 3 节）做到"低功耗且不卡"。
- 其余 9 款处理器维持"均衡=省电+6pp"的百分比方案；要逐颗频点级适配，
  欢迎用户提交 `probe` 输出里的 OPP 表。

## 2. NovaFAS 解析按真机重写（HyperOS 实测）

真机 timestats 的图层块：`displayRefreshRate` → `uid` → `layerName =
包名/Activity#N` → `packageName = `（**常为空**）→ `totalFrames` →
`droppedFrames`。旧解析器只认旧版 `packageNames` 复数键，在 HyperOS 上
永远匹配不到图层 → 帧信号永远不可用 → 只能退 GPU 启发式。

新归属判定（frame_ctrl::parse_timestats）：

1. `packageName`（新版单数）/`packageNames`（旧版逗号列表）命中优先；
2. 为空/缺失时从 `layerName` 提取：`[...]` 括号内容 → `/` 前段 → `#`
   前段，且必须是合法包名（`InputMethod#N`、`none` 不归属）；
3. 显式 packageName 归属其它包时，图层名相似也不误计。

验证：独立程序（rustc 直译同实现）对真机 dump：支付宝图层命中
(39,0)，微信/原神/systemui（不在 dump 中）返回 None，旧格式回归通过。

**替代 Scene FAS**：NovaFAS 现在覆盖 Scene FAS / FEAS / FAS Lite 的
职责（掉帧快加压、稳定慢回落、包络受限、待命零功耗）。Scene 的 FAS
引擎运行在其应用进程内无法单独暂停，**使用本模块时请在 Scene 中关闭
FAS 与 Scene LP 调度**（欢迎弹窗与本文档均已注明）；Scene 联动模式下
四个档位仍由本模块执行下发。检测到独立 fas-rs 进程时 NovaFAS 会按
`override_scene` SIGSTOP 接管、释放时恢复。

## 3. 通知栏 / 超级岛卡顿（SystemUI 突发借用）

- 现象：亮超级岛且有通知时下拉通知栏卡顿，性能档以上不卡。
- 根因：通知展开是 SystemUI 的 burst 负载，省电/均衡上限不够，而模块
  此前感知不到"通知栏拉开了"。
- 修复：`com.android.systemui` 前台且档位为省电/均衡时，下发借用性能
  档频率包络（只借上限，不改档位状态）；触摸按下沿写 eventfd 唤醒主
  循环，识别延迟 ≤0.1 秒；未改变前台的触摸按 2 秒退避，游戏内零风暴。

## 4. WebUI 实时信息（不再空壳）

- 概览状态卡新增**各簇实时频率**：守护进程每个节拍读取各 policy 的
  `scaling_cur_freq`，经 WebSocket `freqs=`（分号分隔 kHz）下发，
  每 2 秒刷新。
- NovaFAS 引擎卡：帧率 / GPU 负载 / 动态加压 / 引擎心跳拍数四项实时
  数值，引擎活着与否一眼可辨。

## 5. 捐赠支持

- 关于页新增「请作者喝杯奶茶」入口，弹窗内附微信赞赏码与支付宝收款码
  （图片已压缩进模块资源，共约 96KB）。
- 首次连接成功后弹一次欢迎窗：四档说明、NovaFAS 与 Scene FAS 的关系、
  通知栏修复、捐赠入口。localStorage 记忆，只弹一次。

## 6. 其余修复（v2.7.3 未发布批次一并包含）

- 处理器识别：SM8750P / SM8850AC 等字母后缀 bin、"领先版/Leading
  Version"营销名、天玑 8400 / 8400-Ultra（红米 K80 至尊版）。
- 均衡档整体贴近省电档（+6pp）、后台 uclamp 85%→75%。
- NovaFAS：dumpsys 2 秒超时、发布无门限、5 秒无信号释放 fas-rs、
  Mali kbase GPU 节点、窗口化丢帧率、pending 上限不阻塞引擎。
- 节点漂移降噪：未接管的 CPUSet/全局 uclamp 不巡检不回写。
- 调速器：骁龙性能/极速 auto 优先 walt，省电/均衡与天玑/玄戒保留 OEM
  （真机确认 OEM 默认即 walt）。

## 验证

- `cargo check --target aarch64-linux-android --all-targets` 零警告。
- `node scripts/check-profiles.cjs`：10 模板字节级一致。
- WebUI 回归：DOM 19 场景 + glass-ui 25 项 + 性能 8 项全部通过。
- 真机（小米 14）：OPP 表/调速器/timestats 采集并用于调优与解析器
  验证；解析器独立验证程序对真实 dump 通过。
- 单测（含新增 shell_burst、通知栏借用、HyperOS 解析、发布无门限）
  在 CI Linux 跑；真机四档功耗/帧率表现欢迎反馈。
