# v2.9.1 修复说明：出厂调速器显式化

作者：ZenJooo · 2026-10 · versionCode 391 · 配置代际 380

## 背景

用户指出：出厂配置里 governor 仍写 `auto`，而骁龙平台的最优选择就是
walt。此前的实现把 walt 偏好藏在运行时逻辑里（且只对性能/极速档生效），
配置文本上看不出实际会跑什么调速器——不透明，也和用户认知不符。

## 改动

十颗处理器的出厂模板全部改为**显式调速器**：

| 平台 | 调速器 | 依据 |
| --- | --- | --- |
| SM8450 / 8475 / 8550 / 8650 / 8750 / 8850（骁龙全系） | **walt** | WALT 窗口负载跟踪，重载提频快；小米 14 真机确认 OEM 四簇默认即 walt |
| DIMENSITY8350 / 8400 / 9400PLUS、XRING_O3 | **schedutil** | MTK/玄戒内核的现代全簇调速器，原厂取向 |

安全性：

- 内核缺失所写调速器时，`hardware::select_governor` 运行时回退链自动
  改用 OEM 正在使用的调速器 → walt/schedutil → interactive → ondemand
  → conservative，**不会安装失败、不会写失败**；适配差异会打印在安装
  第三幕与日志（"mode.cX: walt → schedutil" 这类回退可见）。
- 三星保守策略不受影响（始终保留原厂调速器）。
- `auto` 写法继续兼容（自定义配置可用）：骁龙性能/极速档 auto 优先
  walt，其余保留 OEM。

## 升级识别

v2.8.0–v2.9.0（governor=auto 批次）与 v2.9.1（显式调速器批次）的出厂
指纹在 `STOCK_FINGERPRINTS` 中共存：已装 v2.9.0 的用户升级时，未编辑
过的默认配置自动替换为显式调速器版本；自定义配置原位保留。

## 验证

- `node scripts/check-profiles.cjs`：10 模板与生成器字节级一致
  （governors 表已进 generate-profiles.py / check-profiles.cjs）。
- 新旧两套指纹（20 项）经独立实现核对写入 profiles.rs。
- `cargo check --target aarch64-linux-android --all-targets` 零警告；
  WebUI DOM 22 场景 / glass-ui 25 项全过。
- 真机（小米 14）walt 可用性已确认；其它机型内核若缺 walt 会走回退并
  在日志可见，欢迎反馈。
