# NovaSched_Zen_Edition_Uninstall_Cleanup
# Embedded in the native uninstaller, emitted only for locked shared storage.
# NOVA_USERS contains numeric IDs selected by Rust; no app data is inspected.
umask 077
export PATH="/system/bin:/system/xbin:/data/adb/ksu/bin:/data/adb/ap/bin:/data/adb/magisk:$PATH"
NOVA_RUNTIME=/data/adb/novasched
NOVA_STORAGE_ROOTS="/storage/emulated /data/media"
NOVA_MODULE_ROOTS="/data/adb/modules /data/adb/modules_update /data/adb/ap/modules /data/adb/ap/modules_update"

nova_reinstalled() {
  [ -f "$NOVA_RUNTIME/config.profile" ] || return 1
  for nova_root in $NOVA_MODULE_ROOTS; do
    nova_module="$nova_root/NovaSched_Zen_Edition"
    if [ -f "$nova_module/module.prop" ] && [ ! -e "$nova_module/remove" ] && [ ! -e "$nova_module/.uninstalling" ] &&
        grep -q '^id=NovaSched_Zen_Edition$' "$nova_module/module.prop"; then
      return 0
    fi
  done
  return 1
}

NOVA_ROUNDS=0
while [ "$NOVA_ROUNDS" -lt 450 ]; do
  [ -f "$0" ] || exit 0
  if nova_reinstalled; then
    rm -f "$0"
    exit 0
  fi
  NOVA_REMAINING=""
  for nova_user in $NOVA_USERS; do
    case "$nova_user" in ''|*[!0-9]*) exit 1 ;; esac
    NOVA_ACCESSIBLE=0
    NOVA_FAILED=0
    for nova_root in $NOVA_STORAGE_ROOTS; do
      [ ! -L "$nova_root/$nova_user" ] || continue
      nova_android="$nova_root/$nova_user/Android"
      if [ -d "$nova_android" ] && [ ! -L "$nova_android" ]; then
        if nova_reinstalled; then rm -f "$0"; exit 0; fi
        NOVA_ACCESSIBLE=1
        rm -rf "$nova_android/NovaSched" || NOVA_FAILED=1
      fi
    done
    nova_primary=$(readlink -f /sdcard 2>/dev/null) || nova_primary=""
    case "$nova_primary" in
      "/storage/emulated/$nova_user"|"/data/media/$nova_user")
        if [ -d /sdcard/Android ] && [ ! -L /sdcard/Android ]; then
          if nova_reinstalled; then rm -f "$0"; exit 0; fi
          NOVA_ACCESSIBLE=1
          rm -rf /sdcard/Android/NovaSched || NOVA_FAILED=1
        fi ;;
    esac
    if [ "$NOVA_ACCESSIBLE" = "0" ] || [ "$NOVA_FAILED" = "1" ]; then
      NOVA_REMAINING="$NOVA_REMAINING $nova_user"
    fi
  done
  if [ -z "$NOVA_REMAINING" ]; then
    rm -f "$0"
    exit 0
  fi
  NOVA_USERS=$NOVA_REMAINING
  NOVA_ROUNDS=$((NOVA_ROUNDS + 1))
  sleep 2
done
# No always-running cleanup daemon: leave the script for the next boot retry.
exit 0
