"""Push the v2.2.0 tree to GitHub via the Git Data API.

github.com:443 is unreachable from this network while api.github.com works,
so this replays the committed tree (blob -> tree -> commit -> ref) through
the API with the token stored in the Windows credential manager. The new
commit is parented on the remote main HEAD, producing a fast-forward.
"""
import base64
import concurrent.futures
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

REPO = 'zeng060812-creator/NovaSched-Zen-Edition'
API = f'https://api.github.com/repos/{REPO}'
ROOT = Path(__file__).resolve().parents[1]

def token():
    out = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                         capture_output=True, text=True, cwd=ROOT, timeout=30).stdout
    for line in out.splitlines():
        if line.startswith('password='):
            return line.split('=', 1)[1]
    raise SystemExit('no stored GitHub credential')

TOKEN = token()

def call(method, path, payload=None, expect=None):
    request = urllib.request.Request(f'{API}{path}', method=method)
    request.add_header('Authorization', f'Bearer {TOKEN}')
    request.add_header('Accept', 'application/vnd.github+json')
    request.add_header('User-Agent', 'novasched-release')
    data = json.dumps(payload).encode() if payload is not None else None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, data=data, timeout=60) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors='replace')[:300]
            if error.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(3 * (attempt + 1))
                continue
            raise SystemExit(f'{method} {path} -> HTTP {error.code}: {detail}')
        except urllib.error.URLError as error:
            if attempt < 3:
                time.sleep(3 * (attempt + 1))
                continue
            raise SystemExit(f'{method} {path} -> {error}')

files = sorted(Path(p) for p in subprocess.run(['git', 'ls-files'], capture_output=True, text=True, cwd=ROOT).stdout.splitlines())
print(f'{len(files)} tracked files')

remote_head = call('GET', '/git/ref/heads/main')['object']['sha']
remote_commit = call('GET', f'/git/commits/{remote_head}')
base_tree = remote_commit['tree']['sha']
print(f'remote main = {remote_head[:12]} (tree {base_tree[:12]})')

def make_blob(path):
    content = path.read_bytes()
    blob = call('POST', '/git/blobs', {'content': base64.b64encode(content).decode(), 'encoding': 'base64'})
    return (path.as_posix(), blob['sha'])

entries = []
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for path, sha in pool.map(make_blob, files):
        entries.append({'path': path, 'mode': '100755' if path.endswith(('.sh',)) or path == 'module-template/bin/novasched'
                        or 'update-binary' in path else '100644', 'type': 'blob', 'sha': sha})
print(f'{len(entries)} blobs created')

message = subprocess.run(['git', 'log', '-1', '--pretty=%B'], capture_output=True, text=True, cwd=ROOT).stdout
tree = call('POST', '/git/trees', {'base_tree': base_tree, 'tree': entries})
commit = call('POST', '/git/commits', {'message': message, 'tree': tree['sha'], 'parents': [remote_head]})
print(f'commit {commit["sha"][:12]} on parent {remote_head[:12]}')
call('PATCH', '/git/refs/heads/main', {'sha': commit['sha'], 'force': False})
print('main updated (fast-forward)')
