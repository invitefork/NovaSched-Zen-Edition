# v2.10.3 修复说明：云端更新器 v2（去 API 依赖 + 逐镜像校验）

作者：ZenJooo · 2026-10 · versionCode 403 · 配置代际 390

## 用户反馈

云端更新「更不了」。

## 根因（两处）

1. 旧更新器探测 tag 依赖 `api.github.com`——国内网络直连与镜像大多
   不通，第一步就卡死；
2. ZIP 校验失败发生在"全部镜像下载完"之后，不会回退换镜像重试。

## cloud-update.sh v2

- **去 API 化**：tag 通过 `releases/latest` 的 302 Location 直接取
  （curl redirect_url / wget server-response），资产 URL 由 tag 确定性
  构造，不再解析 JSON；
- **逐镜像"下载+校验"**：直连 → gh-proxy → ghfast → llkk，每个镜像
  下载 ZIP 后立即做体积、PK 头、SHA256 三重校验，不过就换下一个；
- WebUI 安装时显式携带目标 tag（`install <tag>`），脚本少一次探测；
- KEY=VALUE 输出契约不变（CURRENT/LATEST/UPDATE_OK/UPDATE_FAIL/
  MANAGER/阶段），WebUI 无需改动即兼容。

## 版本

- 版本 2.10.3 / 403；配置代际 390 不变。
