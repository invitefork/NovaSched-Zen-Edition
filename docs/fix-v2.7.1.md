# v2.7.1 安装修复

作者：ZenJooo · 模块版本：2.7.1 / 371 · 配置代际：370

## 失败原因

部分用户覆盖安装 2.7.0 时，在第 4 步“准备配置”收到：

```text
novasched: JSON 字段不是字符串
prepare-config 退出码 1
```

旧配置缺少 `features.fas` 或需要从旧格式转换时，迁移器会重新编码 NovaFAS 配置。2.7.0 的编码器把 `step_ms`、`sample_ms`、`ceiling`、`freq_scale` 写成 JSON 整数，解析器却只接受整数字符串。安装流程再次校验迁移结果时就会退出。

全新安装直接复制模板，模板使用字符串，因此不一定出现这个问题。仅修改安装脚本中的版本号不能修复它。

安装显示 v2.6.1 是另一个问题：`customize.sh` 的开始、结束横幅保留了旧的固定文案。

## 本次修复

- NovaFAS 编码统一使用模板中的整数字符串格式。
- 数值字段同时接受非负整数与整数字符串，兼容旧编码器生成的配置；布尔值、空值、数组、对象、负数和越界数值仍然报错。
- 配置出错时显示模板或现有配置的文件路径；NovaFAS 数值错误显示具体字段，例如 `features.fas.step_ms`。
- 安装开始、结束的版本号从 `module.prop` 读取，打包时检查横幅没有固定版本。
- 保留配置迁移前的备份、自定义参数、扩展字段、手动档位和偏好；重复安装不会再次改写已迁移的配置。
- 修正指纹生成器漏算末尾换行的问题，以及几个未跟随 2.7.0 更新的测试断言和 Python 打包检查。
- Node 打包保留 Unix 可执行权限；即使没有 `readelf`，也直接校验 ARM64 静态 ELF 和 16KB 对齐。

调度模板与液态玻璃界面沿用 2.7.0，配置代际保持 370。安装入口仍按能力处理 Magisk / Alpha、KernelSU 系列及兼容分支、APatch。

## 安装

在管理器中覆盖安装 **`NovaSched-v2.7.1-release.zip`**，完成后重启。安装横幅、模块信息和重启后的服务版本应显示 2.7.1。

不要为解决这条报错删除 `/data/adb/novasched`，里面有配置、偏好和原厂节点快照。若新日志指出配置本身存在其他错误，先保留日志与配置，再根据具体字段处理。

`source.zip` 是源码；`webui-update.zip` 只更新界面，都不能代替完整模块修复原生安装错误。

## 构建

准备 Rust、`aarch64-linux-android` 标准库和 Android NDK r27d：

```sh
export CARGO=cargo
export ANDROID_NDK_HOME=/实际路径/android-ndk-r27d
bash scripts/build.sh
```

构建先执行原生测试，再编译静态 Android ARM64 核心并打包。`docs/ci-workflow.yml` 提供 GitHub Actions 示例，需放入 `.github/workflows/ci.yml` 后启用。

## 验证记录

最终验证结果见 `docs/validation-v2.7.1.txt`。原始 2.7.0 源码的编码往返和旧配置迁移用例均复现了同一条 JSON 报错；修复后覆盖九款处理器的迁移、数字兼容、参数保留和重复安装。

管理器适配使用安装脚本模拟验证。真机安装、实际内核节点和 WebView 表现仍需在设备上确认。
