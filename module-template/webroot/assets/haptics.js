/* ZenJooo · NovaSched 触感适配层。
 *
 * 语义请求（select / toggle / success / failure / warning / tick），不暴露
 * 原生参数给业务代码。降级顺序：
 *   1. 宿主原生触感桥（本仓库核实的宿主 API 中——KSU / Magisk / Alpha /
 *      APatch / MMRL——均未文档化触感接口；此处预留 window.NovaHostHaptics
 *      约定：宿主注入该函数即自动启用，未注入 = 能力缺失，如实降级）；
 *   2. navigator.vibrate（用户开启触感且环境支持）；
 *   3. 无触感。
 * 注意事项（按规范如实说明）：
 * - Android 原生 performHapticFeedback 不能被网页直接调用，必须由宿主
 *   App 注入桥接；本模块无法从网页侧补齐这一能力。
 * - 系统触感总开关关闭时，Android 会静默拒绝 vibrate（返回 false）或
 *   空转；网页无法读取系统触感设置，因此“用户允许但系统关闭”的表现
 *   是无振动，模块把它当作终点，不再用其它通道补震。
 * - 不通过 root shell 执行振动命令。
 */
(() => {
  "use strict";
  const STORAGE = "novasched.haptics.v1";
  const PATTERNS = {
    /* 借鉴 iOS 开关/选择的节奏：短促、干脆，不追求“完全等同 iOS”。 */
    select: [8],
    toggle: [12],
    tick: [5],
    success: [10, 60, 18],
    failure: [22, 50, 22],
    warning: [14, 40, 14],
  };
  let enabled = true;
  let vibrateSupported = false;
  let lastAt = 0;
  let lastSemantic = "";
  try { enabled = localStorage.getItem(STORAGE) !== "0"; } catch (_) { /* 宿主可能禁用存储 */ }
  try { vibrateSupported = typeof navigator.vibrate === "function"; } catch (_) { vibrateSupported = false; }

  const nativeBridge = () =>
    typeof window.NovaHostHaptics === "function" ? window.NovaHostHaptics : null;

  function setEnabled(value) {
    enabled = !!value;
    try { localStorage.setItem(STORAGE, enabled ? "1" : "0"); } catch (_) { /* 忽略 */ }
  }
  function isEnabled() {
    return enabled;
  }
  function isNativeAvailable() {
    return nativeBridge() !== null;
  }
  function isVibrateAvailable() {
    return vibrateSupported;
  }
  /* 当前实际生效的通道：native / vibrate / off（用于设置页如实展示）。 */
  function channel() {
    if (!enabled) return "off";
    if (isNativeAvailable()) return "native";
    if (vibrateSupported) return "vibrate";
    return "off";
  }

  /* 同语义最小间隔，防止列表滚动/连点把振动排成队列；不同语义不互相限频。 */
  const THROTTLE_MS = { tick: 60, select: 40, toggle: 40 };
  function fire(semantic) {
    if (!enabled) return false;
    if (document.hidden) return false;
    const pattern = PATTERNS[semantic];
    if (!pattern) return false;
    const now = performance.now();
    const throttle = THROTTLE_MS[semantic];
    if (throttle && semantic === lastSemantic && now - lastAt < throttle) return false;
    lastAt = now;
    lastSemantic = semantic;
    const bridge = nativeBridge();
    if (bridge) {
      try { bridge(semantic); return true; } catch (_) { /* 桥异常按降级处理 */ }
    }
    if (vibrateSupported) {
      try { return navigator.vibrate(pattern); } catch (_) { return false; }
    }
    return false;
  }

  window.NovaHaptics = Object.freeze({
    fire,
    select: () => fire("select"),
    toggle: () => fire("toggle"),
    tick: () => fire("tick"),
    success: () => fire("success"),
    failure: () => fire("failure"),
    warning: () => fire("warning"),
    setEnabled,
    isEnabled,
    channel,
    isNativeAvailable,
    isVibrateAvailable,
  });
})();
