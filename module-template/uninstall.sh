#!/system/bin/sh
# v2.4.0：模块卸载时一并移除内置 NovaSched 应用（保留数据由系统按普通应用规则处理）
NOVA_PKG="com.zenjooo.novasched"
if command -v pm >/dev/null 2>&1; then
  pm uninstall "$NOVA_PKG" >/dev/null 2>&1 || pm uninstall --user 0 "$NOVA_PKG" >/dev/null 2>&1 || true
fi
MODDIR=${0%/*}
umask 077
export PATH="/system/bin:/system/xbin:/data/adb/ksu/bin:/data/adb/ap/bin:/data/adb/magisk:$PATH"

printf '\nNovaSched Zen Edition · 卸载收尾 · ZenJooo\n'
printf '调度下班，系统归位，行李全部带走。\n'
# Print directly: retaining an uninstall.log would itself leave a residue.
# The native command verifies process identity and holds the control locks
# while restoring and cleaning; failures must remain visible to the manager.
if "$MODDIR/bin/novasched" uninstall --module-dir "$MODDIR"; then
  printf '卸载流程完成。请重启手机，让系统重新接手。\n'
else
  NOVA_UNINSTALL_EXIT=$?
  printf '! 卸载未全部完成，请保留上方输出；重启后再卸载。\n'
  exit "$NOVA_UNINSTALL_EXIT"
fi
