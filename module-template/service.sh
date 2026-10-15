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
printf '%s service.sh entered; waiting for boot and first unlock\n' "$(date '+%Y-%m-%d %H:%M:%S')"
until [ "$(getprop sys.boot_completed)" = "1" ]; do
  nova_module_available || exit 0
  sleep 2
done
until "$MODDIR/bin/novasched" boot-ready --module-dir "$MODDIR" >/dev/null 2>&1; do
  nova_module_available || exit 0
  sleep 3
done
# Let SystemUI and the vendor power stack finish their first-unlock work.
# Recheck availability during the wait so a disable/uninstall cancels it.
NOVA_SETTLE=0
while [ "$NOVA_SETTLE" -lt 15 ]; do
  nova_module_available || exit 0
  sleep 2
  if "$MODDIR/bin/novasched" boot-ready --module-dir "$MODDIR" >/dev/null 2>&1; then
    NOVA_SETTLE=$((NOVA_SETTLE + 1))
  else
    NOVA_SETTLE=0
  fi
done
nova_module_available || exit 0
"$MODDIR/bin/novasched" start --module-dir "$MODDIR"
NOVA_EXIT=$?
printf '%s start exited: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$NOVA_EXIT"
exit "$NOVA_EXIT"
