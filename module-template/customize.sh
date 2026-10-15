#!/system/bin/sh
#
#  NovaSched Zen Edition · 安装向导
#  作者 ZenJooo —— 六幕安装动画 + 严格硬件准入 + 云端更新脚本就位
#
SKIPUNZIP=0
NOVA_STATE="/data/adb/novasched"

# ---------- 动画工具箱 ----------
# 安装器输出是逐行追加的，动画 = 按节拍吐行。帧间隔短、总时长可控。
FRAME_DELAY=${NOVA_ANIM_DELAY:-0.12}
NOVA_VERSION=$(sed -n 's/^version=//p' "$MODPATH/module.prop" 2>/dev/null)
[ -n "$NOVA_VERSION" ] || NOVA_VERSION="?"

spin_line() {
  # spin_line <帧数> <文案>：用 ⟳/\ 转轮做一行"进行中"的错觉
  _s_frames="$1"; _s_text="$2"
  _s_i=0
  while [ "$_s_i" -lt "$_s_frames" ]; do
    case $((_s_i % 4)) in
      0) _s_c="◐" ;;
      1) _s_c="◓" ;;
      2) _s_c="◑" ;;
      3) _s_c="◒" ;;
    esac
    ui_print "  $_s_c $_s_text"
    _s_i=$((_s_i + 1))
    sleep "$FRAME_DELAY"
  done
}

bar_line() {
  # bar_line <格数(0..12)> <百分比> <文案>
  _b_filled=$1
  _b_i=0
  _b_bar=""
  while [ "$_b_i" -lt 12 ]; do
    if [ "$_b_i" -lt "$_b_filled" ]; then
      _b_bar="${_b_bar}█"
    else
      _b_bar="${_b_bar}░"
    fi
    _b_i=$((_b_i + 1))
  done
  ui_print "  ┃${_b_bar}┃ $2 $3"
}

banner() {
  ui_print " "
  ui_print "        ╭──────────────────────────╮"
  ui_print "        │   NovaSched Zen Edition  │"
  ui_print "        ╰──────────────────────────╯"
  ui_print "        NovaSched Zen Edition $NOVA_VERSION"
}

stage_header() {
  ui_print " "
  ui_print "  ╔══════════════════════════════════╗"
  ui_print "  ║ 第$1幕 · $2"
  ui_print "  ╚══════════════════════════════════╝"
}

install_fail() {
  ui_print " "
  ui_print "  ✗ $1"
  if [ -r "$MODPATH/install-check.log" ] && mkdir -p "$NOVA_STATE"; then
    if cp -f "$MODPATH/install-check.log" "$NOVA_STATE/install-last.log"; then
      set_perm "$NOVA_STATE/install-last.log" 0 0 0600
      ui_print "  ✗ 失败记录已保留：$NOVA_STATE/install-last.log"
    fi
  fi
  abort "$1"
}

# ---------- 第一幕：开场 ----------
banner
ui_print "  ✦ 版本 $NOVA_VERSION · 作者 ZenJooo"
ui_print "  ✦ 正在展开安装向导…"
spin_line 4 "搬运模块文件"

# ---------- 前置校验（在任何动画继续之前把硬条件查完） ----------
ui_print " "
stage_header "一" "运行环境"
[ -n "$ARCH" ] || ARCH=$(getprop ro.product.cpu.abi 2>/dev/null)
if [ "$ARCH" != "arm64" ] && [ "$ARCH" != "arm64-v8a" ] && [ "$ARCH" != "aarch64" ]; then
  install_fail "仅支持 arm64-v8a，当前 $ARCH"
fi
ui_print "  ✓ 架构 $ARCH"
LEGACY_MODULE="/data/adb/modules/LittleYouran_CTS_Rust"
if [ -d "$LEGACY_MODULE" ] && [ ! -e "$LEGACY_MODULE/disable" ] && [ ! -e "$LEGACY_MODULE/remove" ]; then
  install_fail "检测到仍启用的旧模块 LittleYouran_CTS_Rust，请先停用并重启"
fi
DEVICE_NAME=$(getprop ro.product.model 2>/dev/null)
DEVICE_BRAND=$(getprop ro.product.brand 2>/dev/null)
[ -z "$DEVICE_NAME" ] || ui_print "  ✓ 设备 ${DEVICE_BRAND:-?} $DEVICE_NAME"

# 二进制必须存在且可执行——否则后面所有自检只会给出难懂的报错
if [ ! -x "$MODPATH/bin/novasched" ]; then
  install_fail "模块包缺少 bin/novasched，请重新下载完整安装包"
fi
[ -f "$MODPATH/bin/cloud-update.sh" ] && set_perm "$MODPATH/bin/cloud-update.sh" 0 0 0755
set_perm_recursive "$MODPATH" 0 0 0755 0644
for NOVA_SCRIPT in action.sh service.sh uninstall.sh vtools/powercfg.sh; do
  set_perm "$MODPATH/$NOVA_SCRIPT" 0 0 0755
done
set_perm "$MODPATH/bin/novasched" 0 0 0755

CHECK_LOG="$MODPATH/install-check.log"
: > "$CHECK_LOG" || install_fail "无法创建安装日志"

# run_check：调度器自查统一入口。原生进程把退出码写进 .exit 票据，
# ui_print 管道无法跨管理器可靠传递首命令状态。
run_check() {
  NOVA_PHASE=$1
  NOVA_RECEIPT="$MODPATH/install-$NOVA_PHASE.exit"
  rm -f "$NOVA_RECEIPT" || return 1
  "$MODPATH/bin/novasched" install-check "$NOVA_PHASE" --module-dir "$MODPATH" 2>&1 |
    while IFS= read -r line; do
      ui_print "  $line"
    done
  if [ ! -r "$NOVA_RECEIPT" ]; then
    ui_print "  ✗ 检查进程未留下结束记录"
    return 1
  fi
  NOVA_CHECK_STATUS=$(cat "$NOVA_RECEIPT" 2>/dev/null) || return 1
  case "$NOVA_CHECK_STATUS" in
    0) return 0 ;;
    124) ui_print "  ✗ 本步骤超时，检查进程已停止"; return 1 ;;
    *) ui_print "  ✗ 检查退出码：$NOVA_CHECK_STATUS"; return 1 ;;
  esac
}

# ---------- 第二幕：核心自检 ----------
ui_print " "
stage_header "二" "核心自检"
spin_line 3 "检查二进制与运行权限"
run_check self-test || install_fail "二进制自检失败，请保留 install-last.log"
ui_print "  ✓ 核心自检通过"
bar_line 4 " 33%" "核心就绪"

# ---------- 第三幕：识别处理器（对应调度配置的关键一步） ----------
ui_print " "
stage_header "三" "识别处理器"
spin_line 3 "读取 SoC 证据与 CPU 策略"
run_check probe || install_fail "硬件检测未通过，原因见上方输出与 install-last.log"
DETECTED_SOC=$(sed -n 's/^soc=//p' "$MODPATH/install-probe.log")
DETECTED_PROFILE=$(sed -n 's/^profile=//p' "$MODPATH/install-probe.log")
DETECTED_ID=$(sed -n 's/^soc_id=//p' "$MODPATH/install-probe.log")
ui_print "  ✦ 识别结果：${DETECTED_SOC:-未知}（${DETECTED_ID:-?}）"
ui_print "  ✦ 配套配置：${DETECTED_PROFILE:-未知}"
bar_line 7 " 58%" "已匹配调度档案"
if [ "$(sed -n 's/^compatibility=//p' "$MODPATH/install-probe.log")" = "samsung" ]; then
  ui_print "  ✦ 三星保守策略：保留原厂调速器，暂停 NovaFAS 与额外调度"
fi

# ---------- 第四幕：准备配置 ----------
ui_print " "
stage_header "四" "准备配置"
spin_line 3 "保留已有配置与自动调度偏好"
mkdir -p "$NOVA_STATE" || install_fail "无法创建运行时目录"
run_check prepare-config || install_fail "配置初始化失败；原配置已保留"
run_check prepare-auto || install_fail "自动调度偏好初始化失败"
if [ ! -f "$NOVA_STATE/mode.txt" ]; then
  printf 'powersave\n' > "$NOVA_STATE/mode.txt" || install_fail "无法初始化默认档位"
fi
set_perm "$NOVA_STATE/mode.txt" 0 0 0600
if [ "$(sed -n 's/^automatic_enabled=//p' "$MODPATH/install-prepare-auto.log")" = "true" ]; then
  ui_print "  ✓ 自动调度已开启：游戏极速，其余省电"
else
  ui_print "  ✓ 已保留手动调度偏好"
fi
bar_line 9 " 75%" "配置就绪"

# ---------- 第五幕：检测 Scene ----------
ui_print " "
stage_header "五" "检测 Scene"
if run_check scene-status; then
  SCENE_STATUS=$(sed -n 's/^scene_presence=//p' "$MODPATH/install-scene-status.log") || SCENE_STATUS=unknown
else
  SCENE_STATUS=unknown
fi
case "$SCENE_STATUS" in
  available)
    ui_print "  ✦ 已安装 Scene：重启后由本模块执行它的四档下发"
    ui_print "  ✦ 建议在 Scene 内关闭其 FAS/调度，交给 NovaFAS"
    ;;
  absent) ui_print "  ✦ 未安装 Scene：WebUI 全权接管本地调度" ;;
  *) ui_print "  ✦ Scene 检测暂不可用，服务启动后继续检测" ;;
esac
bar_line 11 " 92%" "Scene 联动确认"

# ---------- 第六幕：完成 ----------
ui_print " "
stage_header "六" "安装完成"
spin_line 4 "写入启动项与云端更新器"
bar_line 12 "100%" "全部完成"
ui_print "  ✓ 原厂节点在首次写入前保存，卸载时恢复"
ui_print "  ✓ 首次解锁后等待 30 秒启动；异常重启自动停用保护"
ui_print "  ✓ 云端更新：WebUI → 设置 → 检查更新"
ui_print "  ✓ 安装记录：$CHECK_LOG"
ui_print "  ✓ 运行记录：$NOVA_STATE/novasched.log"
cp -f "$CHECK_LOG" "$NOVA_STATE/install-last.log" && set_perm "$NOVA_STATE/install-last.log" 0 0 0600
ui_print " "
ui_print "  ✦ NovaSched $NOVA_VERSION · ZenJooo · 感谢刷入 ✦"
ui_print " "
