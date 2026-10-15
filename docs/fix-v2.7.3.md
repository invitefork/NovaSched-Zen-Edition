# v2.7.3 修复说明：处理器识别扩展与 NovaFAS 实时性

作者：ZenJooo · 2026-10 · versionCode 373

本版本针对三类用户反馈：部分机型安装失败、NovaFAS 在 WebUI 上"显示接管但
一动不动"、以及部分用户反复看到"检测到节点漂移"警告。

## 1. 安装失败（一加 Pad 2 Pro / 红米 K80 至尊版 / 特殊 bin 机型）

### 根因

1. **字母后缀衍生型号被当成"未知负面证据"**。一加 Pad 2 Pro（OPD2409）
   的 `ro.soc.model=SM8750P`（骁龙 8 至尊版领先版）。旧解析只接受
   `SM8750` 或 `SM8750-AB` 这类"型号 + 连字符段"的形式，`SM8750P` 直接
   落进负面证据列表，与正面证据合并后触发
   "处理器证据不匹配或相互冲突"，安装中止。
2. **营销名带出货 bin 限定词时无法匹配**。"Snapdragon 8 Elite Gen 5
   Leading Version" / "骁龙8至尊版领先版" 这类命名在去掉品牌前缀后与任何
   已知型号都不相等，同样进入负面证据。
3. **天玑 8400 没有档案**。红米 K80 至尊版（天玑 8400-Ultra）此前完全
   不在支持列表里。

### 修复（native/src/soc.rs、native/src/hardware.rs）

- 新增 `soc::sm_token`：`sm8750p` / `sm8850ac` / `sm8750p-ayn` 统一按
  "基础型号 + 字母数字后缀段"解析，命中基础家族即安装；`sm8650--ab`
  （连续连字符）、`sm8635` 等仍然按不支持处理。设备树与系统属性两条
  路径共用该解析。
- `marketing_model` 剥离 `leadingversion` / `领先版` / `mobileplatform` /
  `forgalaxy` 等纯营销限定词（至多三层，直到不动点），并新增中文命名
  `骁龙8至尊版`、`骁龙8至尊版领先版`、`天玑8400(Ultra)` 的直接匹配。
- **保留**原有的矛盾判定：同一条属性里营销名与 SM 型号不一致（如
  "Snapdragon 8s Gen 3 (SM8650)"）、或两条强证据指向不同处理器时依然
  拒绝安装，避免错误档案下发。
- 新增 `Soc::Dimensity8400` 与 `module-template/config/DIMENSITY8400.json`
  出厂模板（1×A725 + 3×A725 + 4×A525 三簇布局，anchors `[0,4,7,-1]`，
  档位封顶与 8350 对齐），同步更新生成/校验脚本与出厂指纹列表
  （`0x7887d2d07f0f893e`）。

> 小米 18 Fold 等新机型若仍无法安装，请提供
> `/data/adb/novasched/install-last.log` 的 `[probe]` 段：错误信息现在会
> 列出全部检测值（ro.soc.model、设备树、soc_id），拿到实际报告的型号
> 即可补充别名。

## 2. NovaFAS "已接管但实时信息不动"

四个独立缺陷叠加：

| 缺陷 | 位置 | 表现 |
| --- | --- | --- |
| `dumpsys` 无超时阻塞 | `frame_ctrl.rs` Timestats | SurfaceFlinger 繁忙时 dump 不返回，引擎线程冻结，状态永久停在最后一帧 |
| 状态发布门限去抖 | `publish()` | boost 仅在 0/24/48…时发布，12%、36% 的加压永远到不了界面；帧率变化 <2fps 也不发布 |
| 就绪条件过严 | `daemon.rs` | 厂商服务钳制频率上限（pending>0）时引擎永远待命，界面上"接管"却从不进入 active |
| 偶发失败不自愈 | `run()` | `frame_ok = status.fps > 0.0` 使一次成功采样后永远认为帧信号可用，会话失效也不退回启发式 |

### 修复（native/src/frame_ctrl.rs、daemon.rs、websocket.rs、webroot）

- Timestats 的 enable / dump / clear 全部改用 `util::query_command_limited`
  （2 秒超时 + 1 MiB 输出上限）；enable 失败进入 30 秒退避重试，首次
  失败原因记入日志（"帧信号源不可用…退回 GPU 负载启发式"）。
- `publish()` 无条件转发最新状态——守护进程本就按 2 秒节奏取样转发，
  引擎层的门限只会吞数据，不会省流量。
- 连续三次采样失败自动清除 `frame_ok`、强制安排 timestats 重新启用，
  期间用 GPU 负载启发式兜底。
- 引擎状态新增 `gpu`（启发式时的 GPU 忙碌百分比）与 `ticks`（引擎循环
  拍数）；WebSocket 载荷新增 `fasGpu` / `fasTick`，WebUI 引擎卡新增
  "GPU 负载"、"引擎心跳"两行——数值稳定不动时，心跳拍数仍每 2 秒
  递增，一眼区分"稳定"与"卡死"。来源徽标在启发式时显示当前 GPU 读数，
  无任何信号源时如实标注"无信号源 · 仅档位包络"。
- 丢帧率改为窗口增量占比（Δdropped/Δframes），不再被启动以来的累计
  均值钝化。
- 守护进程就绪判定去掉 `pending_control_count()==0`：NovaFAS 只抬
  `scaling_min_freq`，且以内核当前实际接受的 `scaling_max_freq` 为顶，
  天然落在已生效包络内，被钳制的上限不再阻塞引擎。

## 2.5 FAS 帧信号解析按真机数据重写

小米 14（houji，SM8650，HyperOS / Android 16）实测 `dumpsys
SurfaceFlinger --timestats -dump` 的真实结构与旧解析器的假设不符：

| 旧假设 | 真实（HyperOS/Android 16） |
| --- | --- |
| 图层键为 `packageNames`（复数、逗号列表） | `packageName`（单数）且**常为空** |
| 包名只来自 packageName 键 | 包名藏在 `layerName`：`包名/Activity#N` |
| 图层块以 `layerName` 开头 | 块以 `displayRefreshRate`/`uid` 开头，`layerName` 随后 |

后果：在 HyperOS 上解析器**永远匹配不到任何图层** → 返回 None → 引擎
永远退回 GPU 启发式，帧信号功能形同虚设。

新解析归属判定（`frame_ctrl::parse_timestats`）：

1. `packageName` / `packageNames`（兼容旧版逗号列表）命中优先；
2. 两者为空/缺失时从 `layerName` 提取：取 `[...]` 括号内容（SurfaceView）、
   `/` 前段、`#` 前段，且必须是合法包名（`InputMethod#N`、`none` 等系统
   图层不归属）；
3. 显式 packageName 归属其它包时图层名相似也不误计。

独立验证程序对真机 dump 的结果：Alipay 图层正确命中 (39 帧, 0 丢帧)，
systemui/微信/原神（不在 dump 中）返回 None，旧版逗号格式回归通过。
文件：`NovaSched-tools/fas_parse_check.rs`（rustc 独立编译，输出与
crate 内实现逐行一致）。

## 2.6 通知栏 / 超级岛卡顿（SystemUI 突发借用）

用户实测：HyperOS 亮出超级岛并有通知时下拉通知栏会卡，只有性能档以上
不卡。根因：通知展开动画是 SystemUI 的 burst 渲染负载，省电/均衡档的
频率上限把 SystemUI 压出掉帧；而档位状态不会因为下拉通知栏改变。

修复（`scheduler::shell_burst` + 触摸快速通路）：

- **包络借用**：`com.android.systemui` 前台且当前档位为省电/均衡时，
  本次下发借用性能档的频率包络（只影响 CPU 上限，不改档位状态、不改
  mode.txt、不进 cpuset 游戏规则）；通知栏收起、真实应用回到前台后
  下一次下发立即还原。极速/性能档本身高于性能包络，不受影响。三星
  保守策略不参与。
- **触摸快速唤醒**：下拉的第一个动作是指尖按下。输入突频线程在触摸
  按下沿写 eventfd（`ffi::eventfd`），主循环的 EventLoop 把它加入
  poll 集，前台查询立即执行——识别延迟从最坏 2 秒（心跳轮询）降到
  约 0.1 秒（一次 dumpsys 的耗时），赶在展开动画掉帧之前抬频。
- **游戏不受打扰**：触摸触发的查询若没有改变前台（如游戏内连点），
  2 秒内不再因触摸额外查询，避免 dumpsys 风暴；常规 2 秒节拍不变。
- 应用切换瞬间不再依赖 2 秒：`apply_inner` 记录突发状态的进出，状态
  变化时强制真实下发一次。

## 2.7 NovaFAS 无信号自愈与 Mali 节点

- 引擎激活但帧信号与负载信号**都**不可用持续约 5 秒时，自动回到待命
  并 SIGCONT 恢复 fas-rs，不再"暂停了 fas-rs 却不产出"；信号恢复后
  重新接管。
- `read_gpu_busy` 补齐 Mali kbase 节点：`/sys/kernel/gpu/gpu_load` 与
  `/sys/class/misc/mali0/device/gpu_utilisation`——玄戒 O3（Immortalis
  G925）等 Mali 机型即使 timestats 不可用也有启发式可退。

## 3. "检测到节点漂移"反复告警

### 根因

`mode_controls` 在 CPUSet / 全局 uclamp（`/proc/sys/kernel/sched_util_*`）
功能**停用**时，仍把"原厂值"写进巡检期望列表；`apply_mode_uclamp` 也在
每次切档时回写原厂值。出厂配置这两个功能默认关闭，而 Scene 的 fas-rs、
厂商 powerhal 都会改写全局 uclamp——于是每 60 秒巡检一次"漂移"→修复→
被外部改回→再告警，拉锯不止。

### 修复（native/src/scheduler.rs）

- 功能停用的节点不再进入 `expected_controls`，`apply_mode_uclamp` 在
  功能停用时直接跳过：模块没有接管的节点不审计、不回写。原厂值仍由
  模块停止时的快照回滚负责恢复。
- 功能启用时的行为不变（写入、读回校验、漂移修复全部保留）。

## 4. 调速器：骁龙性能/极速档优先 walt

出厂模板四档 governor 均为 `auto`。骁龙平台的 walt 调速器与内核 WALT
窗口负载跟踪联动，重载提频快于 schedutil；现在 `auto` 在骁龙的
**性能/极速档**优先选择 walt（内核未提供时回退 OEM 调速器）。省电/均衡
保留 OEM 调速器取向（多为 schedutil）——配合均衡档贴近省电档的上限
（见第 5 节），日用功耗不被 walt 的快速提频推高。天玑 / 玄戒所有档位
保留 OEM 调速器，不破坏原厂调校。三星保守策略不受影响（始终保留原厂
调速器）。

## 5. 均衡档功耗重调（配置代际 370 → 380）

### 为什么旧均衡档功耗高

频率上限只是"天花板"而不是"地板"——待机和轻负载时均衡档与省电档的
实际频率接近；差距出现在交互 burst（刷信息流、打开应用）：旧均衡档
允许中/大核冲到 60–62%（8 Gen 3 上约 1.8–2.05GHz），这个频段电压抬升
很快，每次 burst 都比省电档（约 1.3–1.5GHz 封顶）贵得多，日用平均功耗
可以高出 10–25%。旧默认里均衡档比省电档高 14–16 个百分点，实际定位
偏向了"中负载生产力"，与"日用甜点"的设计意图不符。

### 重调

均衡档全部压到省电档 +6 个百分点，后台 uclamp 上限 85%→75%：

| SoC | 省电 | 均衡(旧) | 均衡(新) |
| --- | --- | --- | --- |
| SM8450/8475 | 54/46/44 | 68/62/60 | 60/54/52 |
| SM8550 | 54/46/46 | 68/62/62 | 60/54/54 |
| SM8650 | 52/46/44/46 | 66/62/60/62 | 58/54/52/54 |
| SM8750/8850 | 52/46 | 66/58 | 58/50 |
| D8350/8400 | 56/48/46 | 70/64/62 | 62/56/54 |
| D9400PLUS | 52/46/44 | 66/60/58 | 58/52/50 |
| XRING_O3 | 54/46/48 | 68/60/62 | 60/52/54 |

（顺序为各簇上限百分比；需要更高性能时选性能档——其上限未变。）

配置代际升到 380：升级安装时，未编辑过的默认配置自动应用新上限；
自定义配置原位迁移保留并备份。两套出厂指纹（370 与 380）都在
`STOCK_FINGERPRINTS` 中，跨版本升级识别完整。

NovaFAS 均衡档的 ceiling/freq_scale（55/45）未变：它只在掉帧或 GPU
高负载时抬底频，信息流/视频几乎不触发；玩游戏应使用性能/极速档。

## 验证

- `native/src/soc.rs` / `hardware.rs` 新增回归：SM8750P、
  Snapdragon 8 Elite (Gen 5) Leading Version、骁龙8至尊版领先版、
  天玑 8400-Ultra 安装到正确家族；`qcom,sm8850-qrd` + `qcom,sm8850`
  合并证据；8s Gen 3 / SM8635 / SM8650--AB / Dimensity 9400 Ultra
  继续拒绝；性能/极速 auto→walt、省电/均衡与天玑 auto 保留 OEM。
- `frame_ctrl.rs` 新增 publish 无门限回归；既有控制器、timestats 解析、
  floor 换算用例全部保留。
- 出厂模板指纹：本机已装 Node/Rust 工具链，`node scripts/check-profiles.cjs`
  对 10 个模板做字节级一致性检查全部通过；10 个新指纹（380）已用与
  `stock-fingerprints.cjs` 等价的独立实现核对并加入列表，与 370 老指纹共存。
- `cargo check --target aarch64-linux-android --all-targets` 零警告通过；
  Windows 宿主无法链接运行单测（crate 使用 unix 专用 API，与 CI 前一致），
  `cargo test` 与 WebUI DOM 回归（本机 19 项全部通过）分别在 CI 与本机执行。
- **真机验证**（小米 14 / houji / SM8650 / HyperOS Android 16，经 adb）：
  - timestats 真实 dump 经独立验证程序确认新解析器命中、旧解析器落空；
  - 四个 policy 的 OEM 调速器即 walt（可用列表 walt/conservative/powersave/
    performance/schedutil），与"性能/极速优先 walt"的策略一致；
  - 通知栏突发与触摸快速通路的单测在 CI 执行（`cargo test`）。
- 真机的 8400 安装、均衡档新上限功耗、NovaFAS 帧信号与 walt 表现仍需实测反馈。
