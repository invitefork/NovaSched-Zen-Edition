#!/system/bin/sh
# NovaSched_Zen_Edition_Scene_Provider
NOVA_MODULE=@NOVASCHED_MODULE_DIR@
[ ! -e "$NOVA_MODULE/disable" ] && [ ! -e "$NOVA_MODULE/remove" ] && [ ! -e "$NOVA_MODULE/.uninstalling" ] || exit 0
exec "$NOVA_MODULE/bin/novasched" scene-mode "$1" --module-dir "$NOVA_MODULE"
