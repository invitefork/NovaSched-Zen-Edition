# v2.10.2 修复说明：Scene 功耗统计透传

作者：ZenJooo · 2026-10 · versionCode 402 · 配置代际 390

## 问题

Scene 接管模式下，Scene 自带的「功耗统计」页读不到数据。

## 根因

NovaSched 接管 Scene 调度入口时会用 provider 脚本替换
`/data/powercfg.sh`（Scene 原脚本备份为 `powercfg.sh.backup`）。
v2.10.1 的 provider 只应答四档切换命令，Scene「功耗统计」页带着读取类
参数调用同一脚本时没有应答路径 → 统计读不到。

## 修复

provider 改为**模式切换归 NovaSched、其余全部透传**：

- `powersave / balance / performance / fast` → 由 NovaSched 执行；
- 其余任何参数（Scene 功耗统计、状态读取等）→ `exec` 回 Scene 原脚本
  备份（`/data/powercfg.sh.backup`），原脚本缺缺失时静默退出；
- 标记行（Scene_Provider 魔数）保留，安装/卸载/还原逻辑不受影响。

## WiFi 说明

全代码库（native + 脚本 + 模板）经检索**不存在任何 wifi/wlan 写入**；
模块只写 CPU 频率、uclamp、显示刷新率与 mi_display 节点。WiFi 异常与
本模块无关（状态栏 VPN 为用户自装应用）。如仍有异常请提供具体症状。

## 版本

- 版本 2.10.2 / 402；配置代际 390 不变。
