# v2.9.4 修复说明：KernelSU 安装失败（权限先行）

作者：ZenJooo · 2026-10 · versionCode 394 · 配置代际 380

## 现象

KernelSU 上安装 v2.9.x 报「模块包缺少 bin/novasched，请重新下载完整
安装包」→ 安装中止（Error code 1）。

## 根因（安装向导重制引入的回归）

v2.9.3 的 customize.sh 把硬校验 `[ ! -x bin/novasched ]`（存在**且可
执行**）放在 `set_perm` **之前**。而 KernelSU 解压模块时不保留 zip 内
的 unix 可执行位——文件其实完整在包内（v2.9.3 包实测含 1.6MB 有效
ELF），解压后却是 0644，`-x` 判假 → 误报"缺少"并中止。
v2.7.2 的老脚本之所以从未出问题，正是因为它**先 set_perm 全量赋权、
再执行**；重制向导时顺序被颠倒。

## 修复

恢复成熟顺序并保留校验价值：

1. `set_perm_recursive`（目录 0755 / 文件 0644）+ 脚本显式 0755；
2. `bin/novasched` 存在性检查（`-f`，缺失才报"缺少"）；
3. `set_perm 0755`；
4. 复查 `-x`，仍不可执行才中止，报错文案区分"无法赋权"（提示反馈
   机型与管理器版本）与"缺少"两种情况。

Magisk/Alpha/APatch 同步受益（顺序修正对全管理器一致）。

## 验证

- v2.9.3 包解压实测：bin/novasched 在包内、ELF magic 正确——证明是
  权限问题而非缺失。
- WebUI DOM 22 场景、glass-ui 25 项全过；打包器一致性校验通过。
- 真机 KernelSU（小米 14）安装结果待用户刷入反馈。
