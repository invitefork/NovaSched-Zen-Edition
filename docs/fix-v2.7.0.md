# v2.7.0 修复与使用说明

本次交付围绕三件事：**界面与交互重做**、**四档策略按功耗优先重调**、**自研 NovaFAS 帧感知调度引擎**。

## 界面（webroot）

- 信息架构重排：底部 dock 改为 概览 / 规则 / 日志 / 设置 四个平级页面；档位切换直接放在概览首屏，删除了课程表式的日期/周数装饰页头、二级详情栏和右下角快捷菜单，操作路径更短。
- 动画体系统一：所有进出场共用一组缓动（`cubic-bezier(.32,.72,0,1)`）与时长。页面切换为双向转场（旧页滑出、新页滑入同时播放）；弹窗与个性化面板从来源锚点展开、关闭时按同一关键帧反向播放，精确回到来源（从哪来就从哪回去）。Tab 式导航保留每页独立滚动位置。
- 修复玻璃渲染器对已移除的 `#quick-layer` 注册 MutationObserver 的问题（真实浏览器中 `observe(null)` 会直接抛异常，导致整页脚本中断）。
- 新增 NovaFAS 引擎卡：实时显示引擎状态、帧信号来源、实时帧率与动态加压比例；旧版服务回退显示 fas-rs 接口只读状态。

## 调度（config + native）

- 四档全部按功耗优先重调（9 款 SoC 分别给出甜点表，见 `scripts/generate-profiles.py`）：
  - 省电：小核 52–56%、大核 44–48%、超大核 44–48%，只推荐日用信息流；输入法触控靠 15%/100ms 短脉冲保持跟手。
  - 均衡：日用甜点（大核 58–62%），给剪映、AI 生产力留余量，不拉大频率。
  - 性能：按王者荣耀稳定 120 帧的甜点（每芯片不同，例如 8 Gen 3 约 78–82%），仅保留 8% 底频。
  - 极速：中/大核开放到 100% 供原神、鸣潮类 3D 游戏，小核 90–94%；移除全部 `hispeed_freq` 强推参数——之前极速档高频常驻是 10W 功耗的主要原因，现在高频由 NovaFAS 按帧需求动态给出。
- 新增 `features.fas` 配置块（enabled / override_scene / step_ms / sample_ms / 四档 ceiling+freq_scale）。旧配置升级时自动注入默认块；手动改过的配置保留。
- 原生新增 `frame_ctrl.rs`：帧信号（SurfaceFlinger timestats，兜底 GPU 负载启发式）→ 控制器（掉帧快速加压、稳定缓慢回落，基线只在零加压时重学以避免极限环）→ 档位包络内的 top-app uclamp.min 与各簇最低频率写入。所有写入与档位 floor、外部调度器状态联动，档位切换自动复位。
- 检测到 Scene 的 fas-rs 进程时按 `override_scene`（默认开）SIGSTOP 暂停它，由 NovaFAS 接管；引擎停止或卸载时 SIGCONT 恢复，其 `/dev/fas_rs/mode` 节点从不销毁。
- WebSocket 状态新增 `fasEngine/fasEngineSrc/fasFps/fasBoost/fasOverride`；`fas-diagnose` 与 Scene 检测详情同步展示引擎状态。

## 升级

- 配置代际 361 → 370：未修改的默认配置自动重调；自定义配置在原位迁移并保留，更新前生成备份。
- 界面 v2.7.0 与服务版本分开显示；仅更新界面时引擎卡显示旧服务的只读状态。
- 覆盖安装后重启手机生效。卸载恢复原厂快照并恢复被暂停的 fas-rs。

## 验证

- `cargo test`（148+ 用例，含 NovaFAS 控制器/解析器/楼层换算新用例与出厂模板指纹校验）由 GitHub Actions 在 Linux 上执行；本仓库的构建说明见 `.github/workflows/ci.yml`。
- WebUI：`node scripts/test-glass-ui.cjs`、`node scripts/test-webui-dom.cjs`、`node scripts/test-glass-performance.cjs` 本地通过；`node scripts/check-profiles.cjs` 校验 9 份配置与生成器字节级一致。
- Android ELF：AArch64、静态链接、无 INTERP/NEEDED、LOAD 对齐 0x4000（16KB）。真机功耗与帧率表现仍需在设备上复核，NovaFAS 的帧信号源在部分 ROM 上可能不可用，此时自动退回 GPU 负载启发式。
