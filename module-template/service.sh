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
"$MODDIR/bin/novasched" start --module-dir "$MODDIR"
NOVA_EXIT=$?
printf '%s start exited: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$NOVA_EXIT"
exit "$NOVA_EXIT"
