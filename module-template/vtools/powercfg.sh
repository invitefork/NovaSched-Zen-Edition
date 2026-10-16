#!/system/bin/sh
# NovaSched_Zen_Edition_Scene_Provider
# 四档切换由 NovaSched 执行；其余调用（功耗统计、状态读取等 Scene 自带
# 功能）原样透传回 Scene 原脚本备份，保证 Scene 自身功能完整可用。
NOVA_MODULE=@NOVASCHED_MODULE_DIR@
case "$1" in
  powersave|balance|performance|fast)
    [ ! -e "$NOVA_MODULE/disable" ] && [ ! -e "$NOVA_MODULE/remove" ] && [ ! -e "$NOVA_MODULE/.uninstalling" ] || exit 0
    exec "$NOVA_MODULE/bin/novasched" scene-mode "$1" --module-dir "$NOVA_MODULE"
    ;;
esac
if [ -f /data/powercfg.sh.backup ]; then
  exec /system/bin/sh /data/powercfg.sh.backup "$@"
fi
exit 0
