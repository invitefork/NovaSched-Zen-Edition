# v2.0.0 验证记录

版本：2.0.0 / 300。作者：ZenJooo。基于 main `1d625146b599608a718c6184e670d3188ed959da`。

## 已完成

| 检查 | 结果 |
|---|---|
| Rust 单元与回归测试 | 148 项通过，0 项失败，1 项因环境限制跳过 |
| WebUI DOM、通信协议与 CSS 静态检查 | 90 项通过 |
| 安装入口、配置委托、旧选项兼容与升级流程检查 | 29 项通过 |
| 处理器配置生成一致性 | 9 份配置通过 |
| Android 构建 | Rust 1.85.1 + NDK r27d，aarch64-linux-android，静态链接 |
| ELF 校验 | AArch64 EXEC，无 INTERP、无 NEEDED，LOAD 段 0x4000 对齐 |
| 发布归档 | CRC、模块元信息、作者、配置、协议标识、ELF 内容和可执行权限检查通过 |

Rust 检查包含新 cpuinfo 资料、型号精确匹配、非标准 policy 编号、合并与拆分映射、七核 Elite、旧配置迁移与备份、应用规则切换、输入加速基线与小数回读，以及既有认证和恢复行为。硬件节点使用文件夹模拟，四份 cpuinfo 使用本次提供的原始资料。

被跳过的测试为 `process_identity::regression_tests::live_unrelated_process_is_not_accepted_as_daemon`。构建环境不能读取 `/proc/self/stat`，无法执行真实进程身份检查，其它进程身份解析与回归测试已运行。

## 验证范围

尚未进行物理 Android 设备上的安装、功耗、温度、帧率和管理器兼容性测试。新增平台需要设备提供明确型号证据以及可读的 CPU policy 和频率范围；cpuinfo 资料本身不含频率表和调速器列表。

WebUI 通过 DOM、协议和 CSS 检查。当前环境中的无头浏览器启动失败，未完成实际页面渲染和截图检查，也未进行 Android WebView 测试。

## 复现

```sh
python3 scripts/generate-profiles.py --check
cargo test --manifest-path native/Cargo.toml --locked --offline
python3 scripts/test-installer.py
npm ci --ignore-scripts
npm run test:webui
ANDROID_NDK_HOME=/path/to/ndk CARGO=/path/to/cargo bash scripts/build.sh
```

完整构建会依据主机 `/proc` 可读性选择是否跳过上述单项测试，详见 `scripts/build.sh`。源码归档可在没有 Git 元数据的目录中重新打包：

```sh
python3 scripts/package-release.py --source-only
```
