#!/usr/bin/env python3
"""Install a verified static release into the existing physics vhost only.

Run on the Linux host: python3 install-static.py ARCHIVE RELEASE_ID
The package must contain deployment.json with SHA-256 hashes for every file.
"""
import ctypes
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile

SITE = Path('/opt/1panel/www/sites/phy.yachiyo.email')
INDEX = SITE / 'index'
DOMAIN = 'phy.yachiyo.email'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def protected_files():
    paths = list(Path('/opt/1panel/www/conf.d').glob('*.conf'))
    paths += [p / 'index/index.html' for p in SITE.parent.iterdir() if p.is_dir() and p != SITE]
    return {str(p): digest(p) for p in paths if p.is_file()}


def exchange(a, b):
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(a), -100, os.fsencode(b), 2):
        raise OSError(ctypes.get_errno(), 'Atomic directory exchange failed')


def fetch(path):
    return subprocess.check_output([
        'curl', '--fail', '--silent', '--show-error', '--max-time', '15',
        '--resolve', f'{DOMAIN}:443:127.0.0.1', f'https://{DOMAIN}/{path}',
    ])


def install(archive, release):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,90}', release):
        raise ValueError('Invalid release ID')
    if not INDEX.is_dir() or INDEX.is_symlink() or SITE.is_symlink():
        raise ValueError('Expected the existing physics directory, without symlinks')
    stage = SITE / 'releases' / f'stage-{release}'
    backup = SITE / 'backups' / f'index-before-{release}'
    if stage.exists() or backup.exists():
        raise ValueError('Release already exists; use a new release ID')
    before = protected_files()
    stage.mkdir(parents=True, mode=0o755)
    backup.parent.mkdir(exist_ok=True)
    with tarfile.open(archive) as package:
        for member in package.getmembers():
            path = Path(member.name)
            if path.is_absolute() or '..' in path.parts or not (member.isdir() or member.isfile()):
                raise ValueError('Unsafe archive entry')
        package.extractall(stage, filter='data')
    manifest = json.loads((stage / 'deployment.json').read_text())
    if manifest['release'] != release or not re.fullmatch(r'[a-f0-9]{40}', manifest['commit']):
        raise ValueError('Manifest does not match this release')
    for name, expected in manifest['files'].items():
        path = Path(name)
        if path.is_absolute() or '..' in path.parts or digest(stage / path) != expected:
            raise ValueError(f'Checksum mismatch: {name}')
    critical = ['index.html', 'classroom/labs/workspace.js',
                'classroom/electricity/circuit-builder.js', 'classroom/optics/bench.js']
    for name in critical:
        if name not in manifest['files']:
            raise ValueError(f'Missing required asset: {name}')
    # Keep hashed chunks for already-open pages and active ACME challenges.
    for directory in ['_next', '.well-known']:
        old = INDEX / directory
        if not old.is_dir():
            continue
        for source in old.rglob('*'):
            if source.is_file() and not source.is_symlink():
                target = stage / source.relative_to(INDEX)
                if not target.exists():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)
    for path in [stage, *stage.rglob('*')]:
        path.chmod(0o755 if path.is_dir() else 0o644)
    stage.parent.chmod(0o755)
    exchange(INDEX, stage)
    try:
        if json.loads(fetch('deployment.json'))['release'] != release:
            raise ValueError('Served release does not match')
        for name in critical:
            if hashlib.sha256(fetch(name)).hexdigest() != manifest['files'][name]:
                raise ValueError(f'HTTP asset mismatch: {name}')
        if protected_files() != before:
            raise ValueError('Another vhost changed during deployment')
    except BaseException:
        exchange(INDEX, stage)
        raise
    stage.rename(backup)
    print(json.dumps({'release': release, 'commit': manifest['commit'],
                      'backup': str(backup), 'http_checks': 'passed',
                      'protected_vhosts': 'unchanged'}, ensure_ascii=False))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: install-static.py ARCHIVE RELEASE_ID')
    with (SITE / '.physics-deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        install(Path(sys.argv[1]).resolve(), sys.argv[2])
