"""Exercise the WebUI updater and its rollback inside temporary module directories."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/install-webui.sh'
if os.geteuid() != 0:
    raise SystemExit('Run this fixture as root; it never writes to a device module directory.')
with tempfile.TemporaryDirectory(prefix='webui-updater-', dir=ROOT) as temporary:
    base=Path(temporary)
    def module(name, valid=True):
        path=base/name
        (path/'bin').mkdir(parents=True)
        (path/'module.prop').write_text('id='+('NovaSched_Zen_Edition' if valid else 'unrelated_module')+'\nversion=v2.2.8\n')
        binary=path/'bin/novasched';binary.write_bytes(b'fixture executable\n');binary.chmod(0o755)
        (path/'webroot').mkdir();(path/'webroot/index.html').write_text('old UI')
        return path
    target=module('normal')
    result=subprocess.run(['sh',str(SCRIPT),str(target)],capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    assert (target/'webroot/index.html').read_bytes()==(ROOT/'module-template/webroot/index.html').read_bytes()
    assert (target/'bin/novasched').read_bytes()==b'fixture executable\n'
    backup=next(target.glob('.webroot-before-update-*'))
    assert (backup/'index.html').read_text()=='old UI'
    print('PASS updater: installed UI, retained daemon, backed up previous UI')
    target=module('wrong-id',False)
    result=subprocess.run(['sh',str(SCRIPT),str(target)],capture_output=True,text=True)
    assert result.returncode!=0
    assert (target/'webroot/index.html').read_text()=='old UI'
    print('PASS updater: rejects unrelated modules before changing files')
    target=module('rollback')
    shim=base/'command-shim';shim.mkdir()
    mv=shim/'mv'
    real_mv=shutil.which('mv')
    mv.write_text('#!/bin/sh\ncase "$1" in */.webroot-new-*) exit 13;; esac\nexec '+real_mv+' "$@"\n');mv.chmod(0o755)
    environment=dict(os.environ,PATH=str(shim)+':'+os.environ['PATH'])
    result=subprocess.run(['sh',str(SCRIPT),str(target)],capture_output=True,text=True,env=environment)
    assert result.returncode!=0
    assert (target/'webroot/index.html').read_text()=='old UI'
    assert not list(target.glob('.webroot-new-*'))
    print('PASS updater: failed final swap restores old UI and removes staging')
