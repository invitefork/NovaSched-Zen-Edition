#!/system/bin/sh

SKIPUNZIP=0

stage() {
  ui_print " "
  ui_print "◆ [$1/6] $2"
  ui_print "  $3"
}

ui_print " "
ui_print "✦ NovaSched Zen Edition v2.1.1"
ui_print "  ZenJooo 的装机小剧场 · 今日主角：你的手机"
ui_print " "
ui_print "  手机：团战别掉链子，日常别把电吃光。"
ui_print "  Nova：收到，开局踩油门，退场松油门。"

stage 1 "先验票，再上车" "root 是入场券，内核能力才是通行证。"
if [ "$ARCH" != "arm64" ] && [ "$ARCH" != "arm64-v8a" ]; then
  abort "! 仅支持 arm64-v8a，安装已停止。"
fi
LEGACY_MODULE="/data/adb/modules/LittleYouran_CTS_Rust"
if [ -d "$LEGACY_MODULE" ] && [ ! -e "$LEGACY_MODULE/disable" ] && [ ! -e "$LEGACY_MODULE/remove" ]; then
  abort "! 旧模块仍在运行。请停用或卸载旧模块并重启，再安装 NovaSched。"
fi
DEVICE_NAME=$(getprop ro.product.model 2>/dev/null) || DEVICE_NAME=""
if [ -n "$DEVICE_NAME" ]; then
  ui_print "  主角登场：$DEVICE_NAME · $ARCH"
fi
ui_print "  Magisk / Alpha / KernelSU 系列 / APatch：按实际能力检查。"
ui_print "  ✓ 环境入场；接下来请核心报个到。"

set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/bin/novasched" 0 0 0755
set_perm "$MODPATH/action.sh" 0 0 0755
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/uninstall.sh" 0 0 0755
set_perm "$MODPATH/vtools/powercfg.sh" 0 0 0755
CHECK_LOG="$MODPATH/install-check.log"
: > "$CHECK_LOG" || abort "! 无法创建安装日志。"

# Only the installer shell calls ui_print. The native runner owns its child,
# deadline and progress messages; no background shell traps touch the manager.
# A pipeline's status belongs to its last command, so read the runner's receipt.
run_check() {
  NOVA_PHASE=$1
  NOVA_RECEIPT="$MODPATH/install-$NOVA_PHASE.exit"
  rm -f "$NOVA_RECEIPT" || return 1
  "$MODPATH/bin/novasched" install-check "$NOVA_PHASE" --module-dir "$MODPATH" 2>&1 |
    while IFS= read -r line || [ -n "$line" ]; do
      ui_print "  $line"
    done
  if [ ! -r "$NOVA_RECEIPT" ]; then
    ui_print "  ! 检查进程未留下结束记录，不能当作通过。"
    return 1
  fi
  NOVA_CHECK_STATUS=$(cat "$NOVA_RECEIPT" 2>/dev/null) || return 1
  case "$NOVA_CHECK_STATUS" in
    0) return 0 ;;
    124) ui_print "  ! 本步骤已超时，检查进程已停止。"; return 1 ;;
    *) ui_print "  ! 检查未通过，退出码：$NOVA_CHECK_STATUS"; return 1 ;;
  esac
}

stage 2 "核心点火" "Nova：先练好基本功，再接管你的团战。"
run_check self-test || abort "! 二进制自检失败，请保留 install-check.log。"
ui_print "  ✓ 核心自检通过；本次安装不改动 CPU 策略。"

stage 3 "看看是哪位芯片选手" "骁龙、天玑、玄戒，都按这台设备的真实能力配餐。"
run_check probe || abort "! 硬件检测未通过，具体原因见上方输出和 install-check.log。"
ui_print "  ✓ 芯片与内核能力已确认，专属配置就位。"

stage 4 "搬家，旧习惯也带上" "手机：我调过的参数呢？Nova：有效配置和偏好会留着。"
NOVA_STATE="/data/adb/novasched"
mkdir -p "$NOVA_STATE" || abort "! 无法创建运行时目录。"
run_check prepare-config || abort "! 配置初始化失败；原配置已保留。"
run_check prepare-auto || abort "! 自动调度偏好初始化失败，请保留输出。"
if [ ! -f "$NOVA_STATE/mode.txt" ]; then
  printf 'powersave\n' > "$NOVA_STATE/mode.txt" || abort "! 无法初始化默认档位。"
fi
set_perm "$NOVA_STATE/mode.txt" 0 0 0600
if [ "$(sed -n 's/^automatic_enabled=//p' "$MODPATH/install-prepare-auto.log")" = "true" ]; then
  ui_print "  游戏登场 → 极速；回桌面、切日用、锁屏 → 省电。"
  ui_print "  电池：好，下班后总算能歇一会儿了。"
else
  ui_print "  已保留手动调度偏好，可在 WebUI 重新开启自动调度。"
fi
ui_print "  识别有偏差？WebUI 可把应用标记为游戏或日用。"
ui_print "  ✓ 配置与偏好安顿好了。"

stage 5 "Scene 来串门了吗" "只问当前 Android 用户；旧目录和残留记录不算到场。"
if run_check scene-status; then
  SCENE_STATUS=$(sed -n 's/^scene_presence=//p' "$MODPATH/install-scene-status.log") || SCENE_STATUS=unknown
else
  SCENE_STATUS=unknown
fi
case "$SCENE_STATUS" in
  available) ui_print "  当前用户已安装 Scene，首次启动会尝试注册 NovaSched 联动。" ;;
  absent) ui_print "  当前用户未安装 Scene，使用 NovaSched WebUI 管理调度。" ;;
  *) ui_print "  Scene 安装状态检测失败；本次先跳过，运行时会继续检查。" ;;
esac
ui_print "  Nova：有人作伴就联动，一个人也照样开工。"
ui_print "  ✓ Scene 检查结束；继续收尾。"

stage 6 "发车前，点个名" "没有彩蛋卡关，这一站就是安装完成。"
ui_print "  ✓ 原厂恢复：首次控制节点前保存快照。"
ui_print "  ✓ 档位切换：手动选档会退出自动模式。"
ui_print "  ✓ 卸载收尾：停止服务、恢复设置、清理模块残留。"
ui_print " "
ui_print "  管理器没有 WebUI？可使用 KsuWebUI 独立版并授予 root。"
ui_print "  完整安装记录：$CHECK_LOG"
ui_print "  运行记录：/data/adb/novasched/novasched.log"
ui_print " "
ui_print "✦ 六站全部结束 · NovaSched 安装完成"
ui_print "  手机：什么时候上岗？Nova：你重启，我开工。"
ui_print "  ZenJooo：谢谢等我这一会儿，接下来轮到手机努力。"
ui_print "  请重启手机，开始体验。"
