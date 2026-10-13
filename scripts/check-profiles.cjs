#!/usr/bin/env node
/* 本地复刻 generate-profiles.py 的生成逻辑并做字节级一致性检查。
 * CI 里跑 `python3 scripts/generate-profiles.py --check`；两边表格必须同步修改。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LAYOUTS = {
  SM8450: [0, 4, 7, -1], SM8475: [0, 4, 7, -1],
  SM8550: [0, 3, 7, -1], SM8650: [0, 2, 5, 7],
  SM8750: [0, 6, -1, -1], SM8850: [0, 6, -1, -1],
  DIMENSITY8350: [0, 4, 7, -1], DIMENSITY9400PLUS: [0, 4, 7, -1],
  XRING_O3: [4, 0, 1, -1],
};
const CEILINGS = {
  SM8450:            [[54, 46, 44, 0],  [68, 62, 60, 0],  [84, 80, 80, 0],  [92, 98, 100, 0]],
  SM8475:            [[54, 46, 44, 0],  [68, 62, 60, 0],  [84, 80, 80, 0],  [92, 98, 100, 0]],
  SM8550:            [[54, 46, 46, 0],  [68, 62, 62, 0],  [84, 82, 82, 0],  [92, 98, 100, 0]],
  SM8650:            [[52, 46, 44, 46], [66, 62, 60, 62], [82, 80, 78, 80], [90, 98, 100, 100]],
  SM8750:            [[52, 46, 0, 0],   [66, 58, 0, 0],   [80, 72, 0, 0],   [90, 100, 0, 0]],
  SM8850:            [[52, 46, 0, 0],   [66, 58, 0, 0],   [80, 70, 0, 0],   [90, 100, 0, 0]],
  DIMENSITY8350:     [[56, 48, 46, 0],  [70, 64, 62, 0],  [86, 84, 84, 0],  [94, 100, 100, 0]],
  DIMENSITY9400PLUS: [[52, 46, 44, 0],  [66, 60, 58, 0],  [80, 78, 80, 0],  [90, 100, 100, 0]],
  XRING_O3:          [[54, 46, 48, 0],  [68, 60, 62, 0],  [82, 74, 80, 0],  [92, 100, 100, 0]],
};
const FAS_MODES = {
  powersave: { ceiling: "35", freq_scale: "30" },
  balance: { ceiling: "55", freq_scale: "45" },
  performance: { ceiling: "80", freq_scale: "60" },
  fast: { ceiling: "95", freq_scale: "80" },
};

const slots = (policies, value) => policies.map((policy) => (policy >= 0 ? value : "0"));

function profile(soc, policies) {
  const modes = {};
  for (const [name, minimum] of [["powersave", "0%"], ["balance", "0%"], ["performance", "8%"], ["fast", "0%"]]) {
    modes[name] = {
      min: slots(policies, minimum), max: slots(policies, "100%"),
      governors: policies.map((p) => (p >= 0 ? "auto" : "")),
      params: [{}, {}, {}, {}], online: Array(8).fill(true),
    };
  }
  for (const [name, values] of Object.entries({ powersave: 0, balance: 1, performance: 2, fast: 3 })) {
    modes[name].max = CEILINGS[soc][values].map((value, index) => (policies[index] >= 0 ? `${value}%` : "0"));
  }
  const features = {
    node_watchdog: true,
    cpuset: { enabled: false, top_app: "0-7", foreground: "0-7", restricted: "0-3", system_background: "0-3", background: "0-1" },
    cpuctl: { enabled: true, modes: { powersave: { background_max: "65" }, balance: { background_max: "85" } } },
    input_boost: {
      enabled: true, top_app_min: "30", duration_ms: "300", modes: {
        powersave: { top_app_min: "15", duration_ms: "100" },
        balance: { top_app_min: "20", duration_ms: "140" },
        performance: { top_app_min: "28", duration_ms: "180" },
        fast: { top_app_min: "40", duration_ms: "220" },
      },
    },
    launch_boost: { enabled: false, rate_limit_ms: 500, min: ["0", "0", "0", "0"] },
    disable_gpu_boost: false,
    scheduler: {
      enabled: false, energy_aware: true, schedstats: false,
      latency_ns: "10000000", migration_cost_ns: "500000",
      min_granularity_ns: "1000000", wakeup_granularity_ns: "1000000",
      nr_migrate: "32", util_clamp_min: "0", util_clamp_max: "1024",
    },
    foreground_ignore: [],
    perf_lock: { enabled: false, services: [] },
    fas: { enabled: true, override_scene: true, step_ms: "200", sample_ms: "1000", modes: FAS_MODES },
  };
  if (soc === "XRING_O3") Object.assign(features.cpuset, { restricted: "4-7", system_background: "4-7", background: "4-5" });
  return {
    schema: "novasched/2", module: "NovaSched_Zen_Edition",
    meta: { name: "NovaSched Zen Edition", author: "ZenJooo", version: 370, soc, loglevel: "INFO" },
    policies,
    features,
    modes,
  };
}

/* Python json.dumps(indent=2, ensure_ascii=False) 的等价输出。 */
function dumps(value, depth = 0) {
  const pad = "  ".repeat(depth);
  const padIn = "  ".repeat(depth + 1);
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return "[\n" + value.map((item) => padIn + dumps(item, depth + 1)).join(",\n") + "\n" + pad + "]";
  }
  const keys = Object.keys(value);
  if (!keys.length) return "{}";
  return "{\n" + keys.map((key) => `${padIn}${JSON.stringify(key)}: ${dumps(value[key], depth + 1)}`).join(",\n") + "\n" + pad + "}";
}

let failures = 0;
for (const [soc, policies] of Object.entries(LAYOUTS)) {
  const file = path.join(ROOT, "module-template", "config", `${soc}.json`);
  const expected = dumps(profile(soc, policies)) + "\n";
  const actual = fs.readFileSync(file, "utf8");
  if (actual !== expected) {
    failures++;
    console.error(`MISMATCH ${soc}.json`);
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
      if (expected[i] !== actual[i]) {
        console.error(`  first diff at ${i}: expected ${JSON.stringify(expected.slice(i, i + 60))} got ${JSON.stringify(actual.slice(i, i + 60))}`);
        break;
      }
    }
  } else {
    console.log(`OK ${soc}.json`);
  }
}
if (failures) { console.error(`${failures} profile mismatches`); process.exitCode = 1; }
else console.log("9 profiles verified byte-exact");
