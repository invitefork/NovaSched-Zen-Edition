#!/system/bin/sh
SKIPUNZIP=0

stage() {
  ui_print " "
  ui_print "◆ [$1/6] $2"
  ui_print "  $3"
}

ui_print " "
ui_print "✦ NovaSched Zen Edition v2.5.0"
ui_print "  作者 ZenJooo"
stage 1 "检查运行环境" "根据内核能力适配 Magisk、Alpha、KernelSU 系列和 APatch。"
if [ "$ARCH" != "arm64" ] && [ "$ARCH" != "arm64-v8a" ]; then
  abort "! 仅支持 arm64-v8a，安装已停止。"
fi
LEGACY_MODULE="/data/adb/modules/LittleYouran_CTS_Rust"
if [ -d "$LEGACY_MODULE" ] && [ ! -e "$LEGACY_MODULE/disable" ] && [ ! -e "$LEGACY_MODULE/remove" ]; then
  abort "! 请停用或卸载旧模块并重启，再安装 NovaSched。"
fi
DEVICE_NAME=$(getprop ro.product.model 2>/dev/null) || DEVICE_NAME=""
[ -z "$DEVICE_NAME" ] || ui_print "  设备：$DEVICE_NAME · $ARCH"
set_perm_recursive "$MODPATH" 0 0 0755 0644
for NOVA_SCRIPT in action.sh service.sh uninstall.sh vtools/powercfg.sh; do
  set_perm "$MODPATH/$NOVA_SCRIPT" 0 0 0755
done
set_perm "$MODPATH/bin/novasched" 0 0 0755
CHECK_LOG="$MODPATH/install-check.log"
: > "$CHECK_LOG" || abort "! 无法创建安装日志。"

# The native runner records its exit code separately; a UI-print pipeline
# cannot carry the first command's status on every manager's shell.
run_check() {
  NOVA_PHASE=$1
  NOVA_RECEIPT="$MODPATH/install-$NOVA_PHASE.exit"
  rm -f "$NOVA_RECEIPT" || return 1
  "$MODPATH/bin/novasched" install-check "$NOVA_PHASE" --module-dir "$MODPATH" 2>&1 |
    while IFS= read -r line || [ -n "$line" ]; do
      ui_print "  $line"
    done
  if [ ! -r "$NOVA_RECEIPT" ]; then
    ui_print "  ! 检查进程未留下结束记录。"
    return 1
  fi
  NOVA_CHECK_STATUS=$(cat "$NOVA_RECEIPT" 2>/dev/null) || return 1
  case "$NOVA_CHECK_STATUS" in
    0) return 0 ;;
    124) ui_print "  ! 本步骤超时，检查进程已停止。"; return 1 ;;
    *) ui_print "  ! 检查退出码：$NOVA_CHECK_STATUS"; return 1 ;;
  esac
}

stage 2 "核心自检" "检查二进制与运行权限。"
run_check self-test || abort "! 二进制自检失败，请保留 install-check.log。"
ui_print "  ✓ 核心自检通过。"
stage 3 "检测处理器" "读取实际 CPU 策略、频率范围和内核接口。"
run_check probe || abort "! 硬件检测未通过，具体原因见上方输出和 install-check.log。"
ui_print "  ✓ 处理器与内核能力已确认。"
stage 4 "准备配置" "保留已有有效配置和自动调度偏好。"
NOVA_STATE="/data/adb/novasched"
mkdir -p "$NOVA_STATE" || abort "! 无法创建运行时目录。"
run_check prepare-config || abort "! 配置初始化失败；原配置已保留。"
run_check prepare-auto || abort "! 自动调度偏好初始化失败。"
if [ ! -f "$NOVA_STATE/mode.txt" ]; then
  printf 'powersave\n' > "$NOVA_STATE/mode.txt" || abort "! 无法初始化默认档位。"
fi
set_perm "$NOVA_STATE/mode.txt" 0 0 0600
if [ "$(sed -n 's/^automatic_enabled=//p' "$MODPATH/install-prepare-auto.log")" = "true" ]; then
  ui_print "  本地自动调度已开启：游戏极速，其余省电。"
else
  ui_print "  已保留手动调度偏好。"
fi
stage 5 "检测 Scene" "检查 com.omarea.vtools，并核对系统安装记录。"
if run_check scene-status; then
  SCENE_STATUS=$(sed -n 's/^scene_presence=//p' "$MODPATH/install-scene-status.log") || SCENE_STATUS=unknown
else
  SCENE_STATUS=unknown
fi
case "$SCENE_STATUS" in
  available) ui_print "  已确认安装 Scene，重启后注册 NovaSched 调度回调。" ;;
  absent) ui_print "  未安装 Scene，使用 WebUI 管理本地调度。" ;;
  *) ui_print "  Scene 检测暂不可用，服务启动后会继续检测。" ;;
esac
ui_print "  Scene 联动期间由 Scene 决定档位，本地自动调度暂停。"
NOVA_APK="$MODPATH/app/NovaSched.apk"
if [ -f "$NOVA_APK" ]; then
  if command -v pm >/dev/null 2>&1 && pm install -r "$NOVA_APK" >/dev/null 2>&1; then
    ui_print "  ✓ NovaSched 应用已安装"
  else
    ui_print "  · NovaSched 应用将在重启后由开机脚本安装"
  fi
fi
stage 6 "安装完成" "请重启手机，使新版核心与配置生效。"
ui_print "  原厂节点会在首次写入前保存；卸载时恢复。"
ui_print "  管理器没有 WebUI 时，可使用独立 WebUI 宿主并授予 root。"
ui_print "  安装记录：$CHECK_LOG"
ui_print "  运行记录：/data/adb/novasched/novasched.log"
ui_print " "
ui_print "✦ NovaSched v2.5.0 · ZenJooo"
