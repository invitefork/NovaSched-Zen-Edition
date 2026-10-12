# v2.2.7 验证记录

模块作者：ZenJooo。版本代码：327。

## 本次修复

1. Scene 主要包名为 `com.omarea.vtools`。第一次空安装列表不再提前返回；继续核对备用命令和 APK 路径。
2. 当前用户查询失败时仍能读取系统安装记录。已知用户的卸载 / 隐藏记录优先；无法查询时保留检测证据，不把旧数据目录当作安装证据。
3. 查询 stdout 与 stderr 分开，ROM 的警告不会污染用户 ID 或包名；首次查询可在运行目录尚未创建时完成。
4. Scene 联动时本地自动调度暂停，保留偏好。外部调度器接管时本地写入继续暂停。
5. 前台检测独立于自动模式，读取 ActivityManager、窗口焦点、activity top 和多个 top-app 分组。UI 同时显示名称与包名，无元数据接口时直接显示包名。
6. 修复 WebSocket 发现成功后没有设置 `discovered` 的问题，应用规则和日志端点现在可正常打开。
7. 重建五个 WebUI 页面，直接使用 XiaoP Liquid Glass 的原始引擎、CSS、源码和参考样式。适配层为每个玻璃面分配独立滤镜，并处理尺寸变化和动态内容清理。

## 已完成的检查

| 检查 | 结果 | 范围 |
|---|---|---|
| Rust 原生回归 | 176 通过、0 失败；1 项因主机无 `/proc` 被过滤 | 安装查询、Scene、前台读取、调度、配置、回调恢复、WebSocket 认证 |
| 安装入口模拟 | 22 项通过 | Magisk / Alpha / KernelSU / Next / APatch / 无品牌标记、失败退出、回执、Scene 三态、升级保留档位 |
| WebUI 静态检查 | 19 项通过 | 五页、上游源码哈希、MIT 许可、协议、离线资源、主题与 safe-area |
| WebUI DOM 交互 | 6 个服务场景通过 | Scene 联动且保存了自动偏好、无 Scene、检测未知、外部接管、root 备用通道、无应用名元数据 |
| DOM 操作 | 通过 | 五页导航、四档切换、应用规则增删改、无效输入、诊断、Scene 重新注册入口、弹窗焦点、主题和玻璃强度 |
| AArch64 构建 | 成功 | Rust 1.85.1，Android NDK r27d，API 26，静态 bionic ELF |
| ZIP 校验 | 通过 | CRC、作者 / 版本、可执行权限、配置档、认证契约、ELF 一致性与 16KB LOAD 对齐 |

旧的 split-policy 百分比用例显式设置 55% 测试输入，避免后来修改默认档位表导致测试含义漂移。没有改动实际频率配置。

## 尚未完成

- 本地 Chromium 151 在进入页面前以 SIGTRAP 退出，云浏览器也无法访问本地测试服务器，因此没有完成 320 / 393 / 768px 的像素级截图检查。可在常规 Linux 主机设置 `CHROME` 后运行 `npm run test:render`。
- DOM 测试的 Canvas 和组件尺寸是合成数据；其通过表示脚本和交互工作，不代表已经确认每一处像素布局。
- 未连接用户手机，未验证该设备的 ROM、SELinux、Scene 版本和管理器分支。覆盖安装并重启后，应检查 WebUI 的 Scene 检测详情、前台应用包名和切档读回。
- 检测到其它调度回调时保留该回调；重新注册入口不会强制覆盖它。

详细输出：`native-v2.2.7-results.txt`、`installer-v2.2.7-results.txt`、`webui-dom-v2.2.7-results.txt`、`build-v2.2.7-results.txt`。
