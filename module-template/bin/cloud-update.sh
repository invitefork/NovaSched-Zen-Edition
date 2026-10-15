#!/system/bin/sh
# NovaSched 云端更新器 · ZenJooo
# 从 GitHub Release 检查 / 下载 / 校验 / 安装最新版本。
# 用法: cloud-update.sh check
#       cloud-update.sh install [TAG]
# 输出约定: 每行 KEY=VALUE；最后一行 UPDATE_OK=<zip> 或 UPDATE_FAIL=<原因>。
# 下载走直连 + 镜像回退；安装按内核环境选择 ksud / apd / magisk。
MODDIR=${0%/*}
REPO="zeng060812-creator/NovaSched-Zen-Edition"
TMP="/data/local/tmp/novasched-update"
export PATH="/system/bin:/system/xbin:/data/adb/ksu/bin:/data/adb/ap/bin:/data/adb/magisk:$PATH"

say() { printf '%s\n' "$*"; }
fail() { say "UPDATE_FAIL=$1"; exit 1; }

CURRENT=$(sed -n 's/^version=//p' "$MODDIR/../module.prop" 2>/dev/null)
[ -n "$CURRENT" ] || fail "无法读取当前版本"

FETCHER=""
if command -v curl >/dev/null 2>&1; then
  FETCHER="curl"
elif command -v wget >/dev/null 2>&1; then
  FETCHER="wget"
else
  fail "系统没有 curl / wget，无法联网下载"
fi

fetch() {
  # fetch <输出文件> <直连URL>：依次尝试直连与镜像前缀
  _f_dst="$1"; _f_url="$2"
  for _f_prefix in "" "https://gh-proxy.com/" "https://ghfast.top/" "https://gh.llkk.cc/"; do
    _f_target="${_f_prefix}${_f_url}"
    if [ "$FETCHER" = "curl" ]; then
      curl -L --connect-timeout 8 --max-time 300 -o "$_f_dst" -s "$_f_target" && [ -s "$_f_dst" ] && return 0
    else
      # toybox wget 不认 GNU 的 -T；超时交给外层 rootExec 兜底
      wget -q -O "$_f_dst" "$_f_target" && [ -s "$_f_dst" ] && return 0
    fi
  done
  rm -f "$_f_dst"
  return 1
}

MODE="${1:-check}"
WANT="${2:-}"

mkdir -p "$TMP" || fail "无法创建临时目录 $TMP"
API_JSON="$TMP/release.json"
fetch "$API_JSON" "https://api.github.com/repos/$REPO/releases/latest" || fail "无法获取 Release 信息（检查网络或稍后再试）"

LATEST=$(sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' "$API_JSON" | head -n 1)
[ -n "$LATEST" ] || fail "Release 数据解析失败"
ASSET=$(grep -o '"browser_download_url": *"[^"]*-release\.zip"' "$API_JSON" | head -n 1 | sed 's/.*: *"//;s/"$//')
SHA_URL=$(grep -o '"browser_download_url": *"[^"]*SHA256SUMS\.txt"' "$API_JSON" | head -n 1 | sed 's/.*: *"//;s/"$//')
[ -n "$ASSET" ] || fail "Release 中没有 release.zip 资产"

say "CURRENT=$CURRENT"
say "LATEST=$LATEST"
say "ASSET=$ASSET"

version_ge() {
  # version_ge <a> <b>：a >= b 时返回 0（按数字段比较，忽略前导 v）
  _v_a=$(echo "${1#v}" | awk -F. '{print $1*10000+$2*100+$3}')
  _v_b=$(echo "${2#v}" | awk -F. '{print $1*10000+$2*100+$3}')
  [ "$_v_a" -ge "$_v_b" ]
}

if [ "$MODE" = "check" ]; then
  if version_ge "$CURRENT" "$LATEST"; then
    say "UPDATE_OK=latest"
  else
    say "UPDATE_AVAILABLE=$LATEST"
  fi
  exit 0
fi

if [ -n "$WANT" ] && [ "$WANT" != "$LATEST" ]; then
  say "提示: 指定版本 $WANT 与最新 $LATEST 不同，按最新处理"
fi
if version_ge "$CURRENT" "$LATEST"; then
  say "UPDATE_OK=latest"
  say "提示: 当前已是最新版本 $CURRENT"
  exit 0
fi

ZIP="$TMP/NovaSched-$LATEST-release.zip"
rm -f "$ZIP" "$TMP/SHA256SUMS.txt"
say "阶段=下载中"
fetch "$ZIP" "$ASSET" || fail "下载失败（已尝试直连与全部镜像）"
ZIP_SIZE=$(wc -c < "$ZIP")
[ "$ZIP_SIZE" -gt 524288 ] || fail "下载的包不完整（$ZIP_SIZE 字节）"

if [ -n "$SHA_URL" ]; then
  fetch "$TMP/SHA256SUMS.txt" "$SHA_URL"
  if [ -s "$TMP/SHA256SUMS.txt" ]; then
    EXPECTED=$(grep "release\.zip" "$TMP/SHA256SUMS.txt" | awk '{print $1}' | head -n 1)
    ACTUAL=$(sha256sum "$ZIP" 2>/dev/null | awk '{print $1}')
    if [ -n "$EXPECTED" ] && [ -n "$ACTUAL" ] && [ "$EXPECTED" != "$ACTUAL" ]; then
      rm -f "$ZIP"
      fail "SHA256 校验不匹配，已删除损坏的包"
    fi
    [ -n "$EXPECTED" ] && say "阶段=校验通过"
  fi
fi

say "阶段=安装中"
INSTALLED=""
if command -v ksud >/dev/null 2>&1; then
  ksud module install "$ZIP" && INSTALLED="KernelSU"
elif [ -x /data/adb/apd ]; then
  /data/adb/apd module install "$ZIP" && INSTALLED="APatch"
elif command -v magisk >/dev/null 2>&1; then
  magisk --install-module "$ZIP" && INSTALLED="Magisk"
else
  fail "未找到 ksud / apd / magisk，无法安装"
fi
[ -n "$INSTALLED" ] || fail "安装命令执行失败"

say "MANAGER=$INSTALLED"
say "提示=安装完成，请重启手机生效"
say "UPDATE_OK=$ZIP"
