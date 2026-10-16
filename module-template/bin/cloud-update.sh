#!/system/bin/sh
# NovaSched 云端更新器 v2 · ZenJooo
# 不再依赖 api.github.com：tag 通过 releases/latest 的 302 重定向获取
# （直连 + 三个镜像逐个尝试）；ZIP 下载后立即做体积 + SHA256 校验，
# 校验不过自动换下一个镜像，全部失败才报错。
# 用法: cloud-update.sh check | cloud-update.sh install [TAG]
# 输出约定: 每行 KEY=VALUE；结尾 UPDATE_OK=... 或 UPDATE_FAIL=...
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

# fetch <dst> <github-url> <min-bytes>: 直连+镜像逐个试；PK 头过滤 HTML 错误页
fetch() {
  _f_dst="$1"; _f_url="$2"; _f_min="$3"
  for _f_prefix in "" "https://gh-proxy.com/" "https://ghfast.top/" "https://gh.llkk.cc/"; do
    _f_target="${_f_prefix}${_f_url}"
    if [ "$FETCHER" = "curl" ]; then
      curl -sL --connect-timeout 6 --max-time 150 -o "$_f_dst" "$_f_target" || continue
    else
      wget -q -O "$_f_dst" "$_f_target" || continue
    fi
    [ -s "$_f_dst" ] || continue
    _f_size=$(wc -c < "$_f_dst")
    [ "$_f_size" -ge "$_f_min" ] || continue
    if [ "$_f_size" -ge 4 ]; then
      _f_magic=$(dd if="$_f_dst" bs=1 count=2 2>/dev/null)
      if [ "$_f_magic" = "PK" ]; then return 0; fi
      # 非 zip（可能是代理错误页）：允许 JSON/文本通过由调用方校验
      case "$_f_dst" in
        *.json|*.txt) return 0 ;;
      esac
      continue
    fi
  done
  rm -f "$_f_dst"
  return 1
}

get_tag() {
  # releases/latest 302 → .../releases/tag/<tag>
  for _g_prefix in "" "https://gh-proxy.com/" "https://ghfast.top/" "https://gh.llkk.cc/"; do
    _g_url="${_g_prefix}https://github.com/$REPO/releases/latest"
    if [ "$FETCHER" = "curl" ]; then
      _g_loc=$(curl -s -o /dev/null -I -w '%{redirect_url}' --connect-timeout 6 --max-time 25 "$_g_url" 2>/dev/null)
    else
      _g_loc=$(wget -q -S --spider -O /dev/null "$_g_url" 2>&1 | sed -n 's/.*[Ll]ocation: *//p' | head -n 1)
    fi
    case "$_g_loc" in
      */tag/*)
        _g_tag=${_g_loc##*/tag/}
        _g_tag=${_g_tag%%[?]*}
        if [ -n "$_g_tag" ]; then say "LATEST=$_g_tag"; return 0; fi
        ;;
    esac
  done
  return 1
}

MODE="${1:-check}"
WANT="${2:-}"

say "CURRENT=$CURRENT"
if [ "$MODE" = "check" ]; then
  get_tag || fail "无法获取最新版本（直连与镜像均不可达，请检查网络）"
  say "UPDATE_OK=latest"
  exit 0
fi

if [ -n "$WANT" ]; then
  LATEST="$WANT"
else
  get_tag || fail "无法获取最新版本（直连与镜像均不可达，请检查网络）"
fi
[ -n "$LATEST" ] || fail "未指定目标版本"
say "LATEST=$LATEST"

version_ge() {
  _v_a=$(echo "${1#v}" | awk -F. '{print $1*10000+$2*100+$3}')
  _v_b=$(echo "${2#v}" | awk -F. '{print $1*10000+$2*100+$3}')
  [ "$_v_a" -ge "$_v_b" ]
}
if version_ge "$CURRENT" "$LATEST"; then
  say "UPDATE_OK=latest"
  say "提示: 当前已是最新版本 $CURRENT"
  exit 0
fi

ASSET="https://github.com/$REPO/releases/download/$LATEST/NovaSched-$LATEST-release.zip"
SHA_URL="https://github.com/$REPO/releases/download/$LATEST/SHA256SUMS.txt"
say "ASSET=$ASSET"

mkdir -p "$TMP" || fail "无法创建临时目录 $TMP"
ZIP="$TMP/NovaSched-$LATEST-release.zip"
rm -f "$ZIP" "$TMP/SHA256SUMS.txt"
say "阶段=下载中"
downloaded=""
for prefix in "" "https://gh-proxy.com/" "https://ghfast.top/" "https://gh.llkk.cc/"; do
  curl -sL --connect-timeout 6 --max-time 240 -o "$ZIP" "${prefix}${ASSET}" 2>/dev/null || wget -q -O "$ZIP" "${prefix}${ASSET}" 2>/dev/null
  [ -s "$ZIP" ] || continue
  size=$(wc -c < "$ZIP")
  [ "$size" -ge 524288 ] || { rm -f "$ZIP"; continue; }
  head=$(dd if="$ZIP" bs=1 count=2 2>/dev/null)
  [ "$head" = "PK" ] || { rm -f "$ZIP"; continue; }
  say "阶段=已下载"
  # SHA256 校验（与 zip 同源镜像取清单）
  rm -f "$TMP/SHA256SUMS.txt"
  if curl -sL --connect-timeout 6 --max-time 60 -o "$TMP/SHA256SUMS.txt" "${prefix}${SHA_URL}" 2>/dev/null || wget -q -O "$TMP/SHA256SUMS.txt" "${prefix}${SHA_URL}" 2>/dev/null; then
    expected=$(grep "release\.zip" "$TMP/SHA256SUMS.txt" 2>/dev/null | awk '{print $1}' | head -n 1)
    actual=$(sha256sum "$ZIP" 2>/dev/null | awk '{print $1}')
    if [ -n "$expected" ] && [ -n "$actual" ] && [ "$expected" != "$actual" ]; then
      say "阶段=校验失败，换镜像重试"
      rm -f "$ZIP"
      continue
    fi
    [ -n "$expected" ] && say "阶段=校验通过"
  fi
  downloaded=yes
  break
done
[ -n "$downloaded" ] || fail "全部下载通道失败（含校验），请稍后重试或手动下载"

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
