"""Verify the boot shell waits for unlock and cancels on manager disable."""
import os
import subprocess
import tempfile
from pathlib import Path

project = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="nova-boot-", dir=os.environ.get("TMPDIR")) as folder:
    root = Path(folder)
    module = root / "module"
    (module / "bin").mkdir(parents=True)
    service = root / "service.sh"
    service.write_text((project / "module-template/service.sh").read_text().replace(
        "MODDIR=${0%/*}", 'MODDIR="$NOVA_TEST_MODULE"'))
    core = module / "bin/novasched"
    core.write_text('''#!/usr/bin/env python3
import os, sys
from pathlib import Path
module = Path(os.environ['NOVA_TEST_MODULE'])
path = module / 'calls'
path.open('a').write(sys.argv[1] + '\\n')
if sys.argv[1] == 'boot-ready':
    count = path.read_text().splitlines().count('boot-ready')
    sys.exit(1 if count < 3 or os.environ.get('NOVA_LOCKED') else 0)
if sys.argv[1] == 'start': (module / 'started').write_text('yes')
''')
    core.chmod(0o755)
    harness = '''
getprop() { echo 1; }
sleep() {
  NOVA_SLEEP_COUNT=$((NOVA_SLEEP_COUNT + 1))
  if [ -n "$NOVA_DISABLE_AFTER" ] && [ "$NOVA_SLEEP_COUNT" -ge "$NOVA_DISABLE_AFTER" ]; then
    touch "$NOVA_TEST_MODULE/disable"
  fi
}
. "$NOVA_SERVICE"
'''

    def run(**options):
        for name in ["calls", "started", "disable"]:
            (module / name).unlink(missing_ok=True)
        env = dict(os.environ, NOVA_TEST_MODULE=str(module), NOVA_SERVICE=str(service), NOVA_SLEEP_COUNT="0")
        env.update(options)
        return subprocess.run(["sh", "-c", harness], env=env, capture_output=True, text=True, timeout=10)

    result = run()
    assert result.returncode == 0, result.stderr
    calls = (module / "calls").read_text().splitlines()
    assert calls[-1] == "start" and calls.count("start") == 1
    assert calls.count("boot-ready") >= 18, calls
    assert (module / "started").exists()
    print("PASS: first unlock and 30-second settle precede native startup")
    for options in [{"NOVA_LOCKED": "1", "NOVA_DISABLE_AFTER": "3"}, {"NOVA_DISABLE_AFTER": "6"}]:
        result = run(**options)
        assert result.returncode == 0, result.stderr
        assert not (module / "started").exists()
        assert "start" not in (module / "calls").read_text().splitlines()
    print("PASS: disabling during unlock or settle cancels all startup writes")
