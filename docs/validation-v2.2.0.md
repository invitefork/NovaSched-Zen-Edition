# v2.2.0 验证记录

本次修改以 `NovaSched-v2.1.1-source` 为基线。构建主机为 Windows（无 Linux/Android 测试环境），以下通过项均在本机完成；真机项待测。

## 本机通过项

| 项目 | 结果 | 说明 |
|---|---|---|
| Rust 编译检查 | 通过 | `cargo check --target aarch64-linux-android`（NDK r29 链接环境） |
| 测试目标编译 | 通过 | `cargo test --no-run --target aarch64-linux-android`；测试套件执行需要 Linux/Android 主机，本机无法运行，频率断言已按新表人工核对（百分比 × 测试物理上限 3.0GHz） |
| 处理器配置一致性 | 9 通过 | `generate-profiles.py` 重新生成后与 9 份配置字节级一致；`meta.version=320`、四档结构、`policies` 不变 |
| WebUI 结构检查 | 22 通过 | 引擎照抄标记、组件复用、协议常量与 Rust 端一致、FAS 集成、无旧 DOM UI 残留、各 SoC 上限断言（`scripts/test-glass-ui.cjs`，需 node，于 CI/构建机执行） |
| WebUI 渲染 | 通过 | 无头 Edge（WebGL2）加载 `webroot/index.html`：玻璃卡片、四档按钮、开关、标签栏、背景光斑正常渲染，控制台无 JS 错误，fallback 未触发 |
| 打包前置断言 | 通过 | `package-release.py` 的协议键一致性、引擎标记、配置/清单版本断言更新为 v2.2.0 / 320 |

## 行为变更核对

- 省电档上限全部 ≤ 62%（此前最高 70%）；均衡档全部 ≤ 88% 且不再有 100% 不限频档；极速档全部保持 100%。
- `physical_frequency_range` 现把 `scaling_boost_frequencies` 的最大值并入物理上限；`normalize_frequency` 对高于 OPP 表的上限原样下发，读回比较容忍内核接受的较低值，不会进入重写循环。
- FAS：`scheduler.apply_fas_mode` 仅在四个标准档位名、节点存在且守护未被外部调度器锁定时写入；`/dev/fas_rs/mode` 不进入原厂快照。
- 温控/充电：调度器源码无 `/sys/class/thermal` 引用；性能服务白名单继续拒绝 thermal/health/battery/charger；`game_diagnostics` 只读温度节点（结构检查断言覆盖）。

## 真机待验证

- 四档实际功耗与流畅度：重点骁龙 8 Gen 3 均衡档信息流功耗（目标显著低于此前 ~5W）、8 Gen 2 极速档超大核是否到达 3.2GHz boost。
- Scene N1（含其自带 FAS）共存：模式切换跟随、底座模式、外部调度器接管与恢复。
- 液态玻璃 WebUI 在真机 WebView（Magisk / KernelSU / APatch 各宿主）的 WebGL2 可用性与触控。
- 充电速率对照（模块与去温控模块共存时不应劣化）。
