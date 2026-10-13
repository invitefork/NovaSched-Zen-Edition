/* ZenJooo · Keep layout in CSS pixels; Android hosts already convert their insets. */
(() => {
  "use strict";
  const root = document.documentElement;
  const hosts = () => [window.ksu, window.magisk, window.apatch, window.KSU, window.mmrl].filter(Boolean);
  let configured = null, frame = 0;

  function configure() {
    // This path is supplied locally by manager hosts, including MMRL. It also
    // opts newer KernelSU hosts into edge drawing before an API is injected.
    if (!document.getElementById("host-insets") && location.origin === "https://mui.kernelsu.org") {
      const link = document.createElement("link");
      link.id = "host-insets";
      link.rel = "stylesheet";
      link.href = "/internal/insets.css";
      document.head.appendChild(link);
    }
    const host = hosts().find(api => typeof api.enableEdgeToEdge === "function" || typeof api.enableInsets === "function");
    if (!host || host === configured) return;
    try {
      if (typeof host.enableEdgeToEdge === "function") host.enableEdgeToEdge(true);
      else host.enableInsets(true);
      configured = host;
    } catch (_) { /* Older hosts keep their own safe drawing bounds. */ }
  }

  function resize() {
    frame = 0;
    configure();
    const viewport = window.visualViewport;
    const unzoomed = !viewport || Math.abs(viewport.scale - 1) < .01;
    const height = unzoomed && viewport?.height > 0 ? viewport.height : window.innerHeight;
    if (height > 0) root.style.setProperty("--app-height", height + "px");
    root.style.setProperty("--app-top", unzoomed && viewport ? Math.max(0, viewport.offsetTop || 0) + "px" : "0px");
    const keyboard = !!document.activeElement?.matches?.("input:not([type=range]):not([type=color]),textarea")
      && !!viewport && window.innerHeight - viewport.height > 120;
    root.classList.toggle("keyboard-open", keyboard);
    window.dispatchEvent(new Event("nova:viewport"));
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(resize); }
  for (const name of ["resize", "orientationchange", "pageshow", "focusin", "focusout"]) window.addEventListener(name, schedule, { passive: true });
  window.visualViewport?.addEventListener("resize", schedule, { passive: true });
  window.visualViewport?.addEventListener("scroll", schedule, { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  window.NovaHost = Object.freeze({ hosts, refresh: schedule });
  resize();
})();
