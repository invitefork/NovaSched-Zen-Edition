"""Generate NovaSched defaults from one policy definition per supported SoC."""
from pathlib import Path
import argparse
import json

ROOT = Path(__file__).resolve().parents[1]
LAYOUTS = {
    'SM8450': [0, 4, 7, -1], 'SM8475': [0, 4, 7, -1],
    'SM8550': [0, 3, 7, -1], 'SM8650': [0, 2, 5, 7],
    'SM8750': [0, 6, -1, -1], 'SM8850': [0, 6, -1, -1],
    'DIMENSITY8350': [0, 4, 7, -1], 'DIMENSITY9400PLUS': [0, 4, 7, -1],
    'XRING_O3': [4, 0, 1, -1],
}
# Per-SoC tuning. Slot order follows LAYOUTS (c0..c3 = policy anchors,
# little/efficiency first, prime last; -1 = cluster absent on that SoC).
# Percentages resolve against each cluster's physical max on the device.
# Defaults retain the OEM governor and leave optional placement/GPU controls off.
# New platforms use device frequency ranges, without assuming Qualcomm nodes.
SOC_TUNING = {
    # 8 Gen 1: c0=4xA510@1.8 little, c1=3xA710@2.5 big, c2=X2@3.0 prime.
    # A710 runs hot: floors and ceilings stay moderate.
    'SM8450': {
        'powersave': {'max': ['62%', '52%', '52%', '0%']},
        'balance': {'max': ['85%', '82%', '80%', '0%']},
        'performance': {'min': ['20%', '25%', '25%', '0%']},
        'fast': {
            'params': [{}, {'hispeed_freq': '50%'}, {'hispeed_freq': '55%'}, {}],
        },
    },
    # 8+ Gen 1: X2@3.2 — same shape as SM8450 with a slightly higher
    # prime ceiling.
    'SM8475': {
        'powersave': {'max': ['60%', '50%', '50%', '0%']},
        'balance': {'max': ['85%', '82%', '80%', '0%']},
        'performance': {'min': ['20%', '25%', '25%', '0%']},
        'fast': {
            'params': [{}, {'hispeed_freq': '50%'}, {'hispeed_freq': '55%'}, {}],
        },
    },
    # 8 Gen 2: c0=3xA520@1.8 little, c1=4xA715/A710@2.8 big, c2=X3@3.2 prime.
    # Powersave caps to a cool standby/daily profile. Fast keeps every ceiling
    # open and raises hispeed jumps so walt/schedutil actually reaches the
    # prime boost OPP instead of idling one tier below it.
    'SM8550': {
        'powersave': {'max': ['60%', '50%', '52%', '0%']},
        'balance': {'max': ['88%', '82%', '80%', '0%']},
        'performance': {'min': ['20%', '25%', '25%', '0%']},
        'fast': {
            'params': [{}, {'hispeed_freq': '70%'}, {'hispeed_freq': '75%'}, {}],
        },
    },
    # 8 Gen 3: c0=2xA520@2.27 little, c1=3xA720@3.2 big, c2=2xA720@3.0 mid,
    # c3=X4@3.3 prime. v2.2.0 caps balance as well: the previous unlimited
    # balance profile pulled ~5W in heavy feed scrolling. The caps keep daily
    # smoothness while holding a much cooler envelope; powersave stays the
    # full-save profile and fast remains fully open.
    'SM8650': {
        'powersave': {'max': ['58%', '50%', '48%', '54%']},
        'balance': {'max': ['85%', '80%', '78%', '82%']},
        'performance': {'min': ['15%', '20%', '25%', '25%']},
        'fast': {
            'params': [
                {'hispeed_freq': '30%'},
                {'hispeed_freq': '50%'},
                {'hispeed_freq': '55%'},
                {'hispeed_freq': '65%'},
            ],
        },
    },
    # 8 Elite / 8 Elite Gen 5: c0=6x Oryon-E@3.53, c1=2x Oryon-P@4.32.
    # E cores are performance-class: fast mode keeps all 8 cores for
    # foreground, only the prime pair gets a hispeed jump above its floor.
    'SM8750': {
        'powersave': {'max': ['58%', '52%', '0%', '0%']},
        'balance': {'max': ['80%', '75%', '0%', '0%']},
        'performance': {'min': ['15%', '20%', '0%', '0%']},
        'fast': {
            'params': [{}, {'hispeed_freq': '60%'}, {}, {}],
        },
    },
    'SM8850': {
        'powersave': {'max': ['58%', '52%', '0%', '0%']},
        'balance': {'max': ['80%', '75%', '0%', '0%']},
        'performance': {'min': ['15%', '20%', '0%', '0%']},
        'fast': {
            'params': [{}, {'hispeed_freq': '60%'}, {}, {}],
        },
    },
    'DIMENSITY8350': {
        'powersave': {'max': ['62%', '55%', '52%', '0']},
        'balance': {'max': ['85%', '82%', '80%', '0']},
        'performance': {'min': ['15%', '20%', '20%', '0']},
    },
    'DIMENSITY9400PLUS': {
        'powersave': {'max': ['58%', '52%', '50%', '0']},
        'balance': {'max': ['85%', '80%', '78%', '0']},
        'performance': {'min': ['15%', '20%', '20%', '0']},
    },
    'XRING_O3': {
        'powersave': {'max': ['60%', '55%', '50%', '0']},
        'balance': {'max': ['85%', '80%', '78%', '0']},
        'performance': {'min': ['15%', '20%', '20%', '0']},
    },
}

def profile(soc, policies):
    def slots(value):
        return [value if policy >= 0 else '0' for policy in policies]
    modes = {}
    for name, minimum, maximum in [('powersave', '0%', '70%'), ('balance', '0%', '100%'),
                                   ('performance', '15%', '100%'), ('fast', '0%', '100%')]:
        modes[name] = {
            'min': slots(minimum), 'max': slots(maximum),
            'governors': ['auto' if p >= 0 else '' for p in policies],
            'params': [{}, {}, {}, {}], 'online': [True] * 8,
        }
    spec = SOC_TUNING.get(soc, {})
    features = {
        'node_watchdog': True,
        'cpuset': {'enabled': False, 'top_app': '0-7', 'foreground': '0-7',
                   'restricted': '0-3', 'system_background': '0-3', 'background': '0-1'},
        'cpuctl': {'enabled': False},
        'input_boost': {'enabled': False, 'top_app_min': '30', 'duration_ms': '300'},
        'launch_boost': {'enabled': False, 'rate_limit_ms': 500, 'min': ['0'] * 4},
        'disable_gpu_boost': False,
        'scheduler': {'enabled': False, 'energy_aware': True, 'schedstats': False,
                      'latency_ns': '10000000', 'migration_cost_ns': '500000',
                      'min_granularity_ns': '1000000', 'wakeup_granularity_ns': '1000000',
                      'nr_migrate': '32', 'util_clamp_min': '0', 'util_clamp_max': '1024'},
        'foreground_ignore': [],
        'perf_lock': {'enabled': False, 'services': []},
    }
    if soc == 'XRING_O3':
        features['cpuset'].update(restricted='4-7', system_background='4-7', background='4-5')
    for name, fields in spec.items():
        if name in ('cpuset', 'cpuctl'):
            features[name] = fields
            continue
        for key, values in fields.items():
            empty = {} if key == 'params' else '0'
            modes[name][key] = [values[i] if p >= 0 else empty for i, p in enumerate(policies)]
    return {
        'schema': 'novasched/2', 'module': 'NovaSched_Zen_Edition',
        'meta': {'name': 'NovaSched Zen Edition', 'author': 'ZenJooo', 'version': 320,
                 'soc': soc, 'loglevel': 'INFO'},
        'policies': policies,
        'features': features,
        'modes': modes,
    }

def generate(check=False):
    for soc, policies in LAYOUTS.items():
        path = ROOT / 'module-template/config' / (soc + '.json')
        text = json.dumps(profile(soc, policies), ensure_ascii=False, indent=2) + '\n'
        if check:
            assert path.read_bytes() == text.encode('utf-8'), f'{path.name} differs from generated defaults'
        else:
            # Write bytes so Windows hosts keep the LF endings Android expects.
            path.write_bytes(text.encode('utf-8'))
    print(f'{len(LAYOUTS)} NovaSched profiles ' + ('verified' if check else 'generated'))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    generate(parser.parse_args().check)
