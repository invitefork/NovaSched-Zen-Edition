#!/system/bin/sh
MODDIR=${0%/*}
nova_module_available() {
  [ -d "$MODDIR" ] && [ ! -e "$MODDIR/remove" ] &&
    [ ! -e "$MODDIR/disable" ] && [ ! -e "$MODDIR/.uninstalling" ]
}
nova_module_available || exit 0
umask 077
export PATH="/system/bin:/system/xbin:/data/adb/ksu/bin:/data/adb/ap/bin:/data/adb/magisk:$PATH"
# Keep pre-ELF evidence inside the module. A late boot shell must not recreate
# the persistent runtime directory after the uninstaller has removed it.
exec >>"$MODDIR/boot-entry.log" 2>&1 || exit 1
printf '%s service.sh entered; waiting for boot completion\n' "$(date '+%Y-%m-%d %H:%M:%S')"
until [ "$(getprop sys.boot_completed)" = "1" ]; do
  nova_module_available || exit 0
  sleep 2
done
nova_module_available || exit 0
# v2.4.0：强制安装/升级内置 NovaSched 应用（-r 覆盖安装；失败不阻断调度启动，
# 下一轮重启重试）。安装日志留在 boot-entry.log 便于排查。
NOVA_APK="$MODDIR/app/NovaSched.apk"
if [ -f "$NOVA_APK" ]; then
  NOVA_TRY=0
  until pm install -r "$NOVA_APK" >/dev/null 2>&1; do
    NOVA_TRY=$((NOVA_TRY + 1))
    [ "$NOVA_TRY" -ge 5 ] && { printf '%s apk install failed after %d tries\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$NOVA_TRY"; break; }
    printf '%s apk install retry %d\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$NOVA_TRY"
    sleep 3
  done
  NOVA_TRY=0
fi
"$MODDIR/bin/novasched" start --module-dir "$MODDIR"
NOVA_EXIT=$?
printf '%s start exited: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$NOVA_EXIT"
exit "$NOVA_EXIT"
