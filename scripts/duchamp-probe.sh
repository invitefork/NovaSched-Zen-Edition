#!/system/bin/sh
# NovaSched · duchamp (POCO X6 Pro, Dimensity 8300-Ultra / MT6897) cihaz sondası.
#
# Salt okunur: hiçbir düğüme yazmaz. Root gerekir. Termux içinde:
#   su -c "sh $PWD/scripts/duchamp-probe.sh" > duchamp-probe.txt 2>&1
# Çıktıdaki "CHECK" satırları, DIMENSITY8300 şablonunun dayandığı varsayımları
# (küme düzeni, MIDR, tanıma kanıtı, GPU devfreq) cihazda sınar.

FAIL=0
pass() { echo "CHECK PASS  $1"; }
fail() { echo "CHECK FAIL  $1"; FAIL=$((FAIL + 1)); }
note() { echo "CHECK NOTE  $1"; }
section() { echo; echo "=== $1 ==="; }
rd() { [ -r "$1" ] && tr -d '\000' < "$1" 2>/dev/null | head -c 400 | tr '\n' ' '; }

section "kimlik (hardware::detect ile aynı özellikler)"
for k in ro.soc.model ro.soc.manufacturer ro.vendor.soc.model \
         ro.vendor.mediatek.soc.model ro.vendor.qti.soc_model ro.boot.soc_model \
         ro.board.platform ro.vendor.board.platform ro.hardware \
         ro.product.manufacturer ro.product.brand ro.product.device \
         ro.product.model ro.build.version.release ro.build.version.sdk \
         ro.mi.os.version.name ro.build.version.incremental; do
  echo "$k=$(getprop $k)"
done
echo "kernel=$(uname -r) arch=$(uname -m)"
echo "selinux=$(getenforce 2>/dev/null)"

section "device-tree compatible"
COMPAT="$(for f in /proc/device-tree/compatible /sys/firmware/devicetree/base/compatible; do
  [ -r "$f" ] && tr '\000' '\n' < "$f"; done)"
echo "$COMPAT"

section "tanıma sınaması"
SOCMODEL="$(getprop ro.soc.model)"; PLAT="$(getprop ro.board.platform)"; HW="$(getprop ro.hardware)"
case "$(echo "$SOCMODEL" | tr 'A-Z' 'a-z')" in
  mt6897*|*8300*) pass "ro.soc.model=$SOCMODEL (soc.model kanıtı var)";;
  *) note "ro.soc.model='$SOCMODEL' MT6897 değil; tanıma board.platform/ro.hardware veya device-tree'ye düşer";;
esac
case "$(echo "$PLAT $HW" | tr 'A-Z' 'a-z')" in
  *mt6897*) pass "board.platform/ro.hardware = mt6897 ($PLAT / $HW)";;
  *) fail "board.platform='$PLAT' ro.hardware='$HW' mt6897 içermiyor";;
esac
if echo "$COMPAT" | tr 'A-Z' 'a-z' | grep -q 'mediatek,mt6897'; then
  pass "device-tree compatible mediatek,mt6897 var"
else
  note "device-tree compatible içinde mediatek,mt6897 yok (diğer kanıtlar yeterli olabilir)"
fi

section "/proc/cpuinfo (CPU part)"
PARTS="$(awk -F: '/^processor/{p=$2+0} /CPU part/{gsub(/ /,"",$2); print p":"$2}' /proc/cpuinfo)"
echo "$PARTS" | tr '\n' ' '; echo
grep -i '^Hardware' /proc/cpuinfo
EXPECT="0:0xd46 1:0xd46 2:0xd46 3:0xd46 4:0xd4d 5:0xd4d 6:0xd4d 7:0xd4d"
if [ "$(echo $PARTS)" = "$EXPECT" ]; then
  pass "MIDR: cpu0-3 A510 (0xd46), cpu4-7 A715 (0xd4d)"
else
  fail "MIDR beklenenden farklı. Beklenen: $EXPECT"
fi

section "cpufreq policy"
POLICIES=""
for p in /sys/devices/system/cpu/cpufreq/policy*; do
  [ -d "$p" ] || continue
  # related_cpus çekirdekte "0 1 2 3" gibi boşluklu yazılır; virgüle çevir.
  id="${p##*policy}"; POLICIES="$POLICIES $id=$(echo $(rd $p/related_cpus) | tr ' ' ',')"
  echo "-- policy$id"
  for n in related_cpus scaling_driver scaling_governor scaling_available_governors \
           cpuinfo_min_freq cpuinfo_max_freq scaling_min_freq scaling_max_freq \
           scaling_available_frequencies; do
    echo "   $n: $(rd $p/$n)"
  done
  g="$(rd $p/scaling_governor | tr -d ' ')"
  for d in "$p/$g" "$p/schedutil" "$p/sugov_ext"; do
    [ -d "$d" ] && { echo "   gov-params $d:"; for f in "$d"/*; do [ -f "$f" ] && echo "     $(basename $f)=$(rd $f)"; done; }
  done
done
norm="$(echo $POLICIES)"
if [ "$norm" = "0=0,1,2,3 4=4,5,6 7=7" ] || [ "$norm" = "0=0-3 4=4-6 7=7" ]; then
  pass "policy düzeni 0=0-3 4=4-6 7=7 (anchors [0,4,7,-1])"
else
  fail "policy düzeni beklenen 0=0-3 4=4-6 7=7 değil: $norm"
fi
for p in 0 4 7; do
  t="$(rd /sys/devices/system/cpu/cpufreq/policy$p/scaling_available_frequencies)"
  n=$(echo $t | wc -w)
  [ "$n" -ge 2 ] && pass "policy$p frekans tablosu $n OPP" || fail "policy$p frekans tablosu yok/kısa"
done
G="$(rd /sys/devices/system/cpu/cpufreq/policy0/scaling_available_governors)"
case "$G" in *schedutil*) pass "schedutil mevcut (şablon governor'ı)";; *) fail "schedutil yok: $G";; esac
MIN="$(rd /sys/devices/system/cpu/cpufreq/policy4/cpuinfo_min_freq | tr -d ' ')"
MAX="$(rd /sys/devices/system/cpu/cpufreq/policy4/cpuinfo_max_freq | tr -d ' ')"
if [ "${MAX:-0}" -gt 100000 ] 2>/dev/null && [ "${MAX:-0}" -lt 6000000 ] 2>/dev/null; then
  pass "cpuinfo_max_freq makul ($MIN..$MAX kHz)"
else
  note "cpuinfo aralığı sahte olabilir ($MIN..$MAX); modül OPP tablosuyla çapraz doğrular"
fi

section "cpu online düğümleri"
for c in 0 1 2 3 4 5 6 7; do
  [ -e /sys/devices/system/cpu/cpu$c/online ] && echo "cpu$c online=$(rd /sys/devices/system/cpu/cpu$c/online)" || echo "cpu$c online düğümü yok"
done

section "GPU devfreq (scheduler::detect_gpu_devfreq ile aynı ölçüt)"
GPU_FOUND=""
for d in /sys/class/devfreq/*; do
  [ -e "$d" ] || continue
  name="$(basename "$d")"
  echo "-- $name governor=$(rd $d/governor) min=$(rd $d/min_freq) max=$(rd $d/max_freq)"
  echo "   available_frequencies: $(rd $d/available_frequencies)"
  echo "   available_governors: $(rd $d/available_governors)"
  lower="$(echo "$name" | tr 'A-Z' 'a-z')"
  case "$lower" in *kgsl-3d0*|*mali*|gpu*)
    if [ -r "$d/min_freq" ] && [ -r "$d/max_freq" ] && [ -r "$d/available_frequencies" ]; then
      cnt=$(echo $(cat $d/available_frequencies 2>/dev/null) | wc -w)
      [ "$cnt" -ge 2 ] && [ -z "$GPU_FOUND" ] && GPU_FOUND="$d"
    fi;;
  esac
done
if [ -n "$GPU_FOUND" ]; then
  pass "GPU devfreq adayı bulundu: $GPU_FOUND (gpu_devfreq açılabilir)"
else
  note "modülün ölçütüne uyan GPU devfreq düğümü yok; gpu_devfreq varsayılan kapalı kalmalı"
fi
echo "-- diğer GPU düğümleri"
for f in /sys/class/misc/mali0/device/gpu_utilisation /sys/kernel/ged/hw/gpu_meter \
         /sys/kernel/gpu/gpu_load /proc/gpufreqv2/gpufreq_status /proc/gpufreq/gpufreq_opp_freq \
         /sys/kernel/ged/hal/current_freqency /sys/module/ged/parameters/gpu_cust_boost_freq; do
  [ -e "$f" ] && echo "   VAR  $f : $(rd $f)" || echo "   YOK  $f"
done

section "cpuctl / uclamp / cpuset (modülün yazdığı yollar)"
for g in top-app foreground background system-background restricted; do
  for base in /dev/cpuctl /sys/fs/cgroup /sys/fs/cgroup/cpu; do
    for f in cpu.uclamp.min cpu.uclamp.max; do
      [ -e "$base/$g/$f" ] && echo "VAR  $base/$g/$f = $(rd $base/$g/$f)"
    done
  done
done
for f in /proc/sys/kernel/sched_util_clamp_min /proc/sys/kernel/sched_util_clamp_max /proc/sys/kernel/sched_energy_aware; do
  [ -e "$f" ] && echo "VAR  $f = $(rd $f)" || echo "YOK  $f"
done
if [ -e /dev/cpuctl/top-app/cpu.uclamp.min ] || [ -e /sys/fs/cgroup/top-app/cpu.uclamp.min ]; then
  pass "top-app cpu.uclamp.min düğümü var (cpuctl/input_boost kullanabilir)"
else
  fail "top-app cpu.uclamp.min bulunamadı (cpuctl/input_boost devre dışı kalmalı)"
fi
echo "cpuset gruplar: $(ls /dev/cpuset 2>/dev/null | tr '\n' ' ')"

section "thermal bölgeleri (tam tarama)"
for z in /sys/class/thermal/thermal_zone*; do
  [ -d "$z" ] && echo "$(basename $z) type=$(rd $z/type) temp=$(rd $z/temp) mode=$(rd $z/mode)"
done
echo "cooling_device sayısı: $(ls -d /sys/class/thermal/cooling_device* 2>/dev/null | wc -l)"

section "pil / güç düğümleri (FAS telemetri)"
for f in /sys/class/power_supply/battery/current_now /sys/class/power_supply/battery/voltage_now \
         /sys/class/power_supply/battery/temp /sys/class/power_supply/battery/power_now \
         /sys/class/power_supply/bms/current_now /sys/class/power_supply/main/current_now; do
  [ -e "$f" ] && echo "VAR  $f = $(rd $f)" || echo "YOK  $f"
done

section "MTK'ye özgü, governor ile yarışabilecek yollar (yalnızca varlık)"
for f in /proc/cpufreq /proc/ppm /proc/perfmgr /sys/kernel/fpsgo /sys/module/mtk_fpsgo \
         /sys/devices/platform/soc/soc:mtk_ppm /sys/kernel/eara_thermal /proc/mtk_batoc_throttling; do
  [ -e "$f" ] && echo "VAR  $f" || echo "YOK  $f"
done
[ -r /proc/ppm/policy_status ] && { echo "-- /proc/ppm/policy_status"; head -c 600 /proc/ppm/policy_status; }

section "yenileme hızı ayarları (feed_video)"
echo "min_refresh_rate=$(settings get system min_refresh_rate 2>/dev/null) peak_refresh_rate=$(settings get system peak_refresh_rate 2>/dev/null)"

section "özet"
if [ "$FAIL" -eq 0 ]; then echo "SONUÇ: tüm kritik kontroller geçti (FAIL=0)"; else echo "SONUÇ: $FAIL kritik kontrol başarısız; çıktıyı paylaşın"; fi
exit 0
