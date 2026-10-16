# v2.10.0 修复说明：天玑 9400+ 识别、功耗预算档、信息流 30Hz 锁帧

作者：ZenJooo · 2026-10 · versionCode 400 · 配置代际 390

## 1. 天玑 9400+（MT6991）识别修复

Redmi dali（25060RK16C）以平台码上报：`ro.soc.model=MT6991`、
`ro.board.platform=mt6991`、`ro.vendor.mediatek.platform=MT6991`，此前
不命中任何映射 → 报"未识别到支持的处理器"。

新增 `soc::mtk_platform` 平台码映射（MT6991 → Dimensity9400Plus），接入
soc.model 直查、token 扫描、设备树 mediatek 分支三路；真机采集（本仓库
SoC 采集器输出）确认布局与 DIMENSITY9400PLUS 模板完全一致：
policy0=cpu0-3(A725 339-2400M)、policy4=cpu4-6(X925 622-3300M)、
policy7=cpu7(X925 798-3730M)，anchors [0,4,7,-1]，调速器 schedutil 系。
回归：dali 全量证据识别 ✓；与骁龙平台码混报拒绝 ✓。

## 2. SM8650 功耗预算档（省电 ≤2W / 均衡 ≤3W）

按骁龙 8 Gen 3 频率-功耗特性重排两档上限（真机 OPP 吸附后实际频点）：

| 档位 | 上限 % | 实际频点 MHz | 预算 |
| --- | --- | --- | --- |
| 省电 | 60/45/49/45 | 1344/1402/1402/1478 | CPU 满载 ≈2W |
| 均衡 | 70/58/56/59 | 1574/1824/1613/1939 | CPU 满载 ≈3W |
| 性能 / 极速 | 不变 | 王者甜点 / 游戏全开 | 不变 |

同时省电/均衡的 FAS ceiling 35/55 与 freq_scale 30/45 保持——锁帧后
帧率低，FAS 抬频需求进一步下降。该预算为基于 OPP 的工程估算，实际
整机功耗受屏幕/信号/温度影响，请以真机仪表读数为准反馈。

## 3. 信息流视频 30Hz 锁帧（features.feed_video）

- 配置块 `features.feed_video`：enabled / fps(24..120) / packages
  （默认：抖音、快手、小红书、B 站，最多 32 项，可增删）。
- 前台命中清单应用 → 立即把屏幕刷新率限制到 30Hz；切走立即恢复原值。
- 通道：MI mi_display sysfs 节点（disp-DSI-0/max_fps_clone 等候选探测，
  写前存原值）→ HyperOS 全局刷新率 settings（min+peak 双写，原值 null
  则恢复时 delete）。全不可用则记一条日志如实失效。
- Scene 外部调度接管时不动作；守护停止时必恢复；WebUI 引擎卡显示
  "信息流 30Hz 锁帧生效中"，WebSocket 新增 `feedFps=1/0`。

## 配置代际 380 → 390

模板新增 feed_video 块 + SM8650 两档重调，代际升级后未编辑的默认配置
自动更新；全部历史批次指纹（370/380-auto/380-explicit/390）共存识别。
