"""ZenJooo: check power-policy bounds in every shipped processor profile.

This validates configuration, not phone power consumption or frame pacing.
"""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
modes = ("powersave", "balance", "performance", "fast")
count = 0
for path in sorted((root / "module-template/config").glob("*.json")):
    config = json.loads(path.read_text())
    assert config["meta"]["author"] == "ZenJooo"
    assert config["meta"]["version"] == 361
    assert set(config["modes"]) == set(modes)
    for slot, policy in enumerate(config["policies"]):
        limits = []
        for mode in modes:
            profile = config["modes"][mode]
            assert all(profile["online"]), "Default tuning must not offline OEM cores"
            minimum = profile["min"][slot]
            maximum = profile["max"][slot]
            if policy < 0:
                assert minimum == maximum == "0"
                assert profile["governors"][slot] == ""
                assert profile["params"][slot] == {}
                continue
            assert minimum.endswith("%") and maximum.endswith("%")
            floor, ceiling = int(minimum[:-1]), int(maximum[:-1])
            assert 0 <= floor <= ceiling <= 100
            assert floor <= 10, "A permanent high floor wastes idle power"
            limits.append(ceiling)
            assert profile["governors"][slot] == "auto"
        if policy >= 0:
            assert all(a < b for a, b in zip(limits, limits[1:])), limits
            assert limits[-1] == 100
    features = config["features"]
    assert not features["disable_gpu_boost"]
    assert not features["perf_lock"]["enabled"] and not features["perf_lock"]["services"]
    assert not features["scheduler"]["enabled"] and not features["cpuset"]["enabled"]
    assert features["node_watchdog"]
    pulses = features["input_boost"]["modes"]
    assert set(pulses) == set(modes)
    floors = [int(pulses[mode]["top_app_min"]) for mode in modes]
    durations = [int(pulses[mode]["duration_ms"]) for mode in modes]
    assert floors == sorted(floors) and 0 < floors[0] < floors[-1] <= 40
    assert durations == sorted(durations) and 50 <= min(durations) <= max(durations) <= 250
    assert set(features["cpuctl"]["modes"]) == {"powersave", "balance"}
    assert 50 <= int(features["cpuctl"]["modes"]["powersave"]["background_max"]) < int(features["cpuctl"]["modes"]["balance"]["background_max"]) < 100
    count += 4
    print("PASS", path.stem, "four ordered profiles, bounded pulses, OEM safety controls")
print(f"PASS: {count} processor/mode configurations. No device energy measurements were made.")
