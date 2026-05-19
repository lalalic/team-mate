#!/usr/bin/env python3
"""Upload team-mate www/ (index, privacy, support, screenshots) to Qiniu CDN.

Reads QINIU_ACCESS_KEY / QINIU_SECRET_KEY from neox/.env.local or root .env.local.
Uploads under pub/teams/ prefix on the qiliadmin bucket.
Public URLs land at https://cdn.qili2.com/pub/teams/<key>
"""
import os
import sys
import hmac
import hashlib
import base64
import json
import urllib.request
import mimetypes

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..', '..'))
WWW = os.path.abspath(os.path.join(SCRIPT_DIR, '..', 'www'))

env = {}
for env_path in [
    os.path.join(ROOT, 'neox', '.env.local'),
    os.path.join(ROOT, '.env.local'),
]:
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    env.setdefault(k, v.strip('"').strip("'"))

ACCESS_KEY = env.get('QINIU_ACCESS_KEY', '')
SECRET_KEY = env.get('QINIU_SECRET_KEY', '')
BUCKET = env.get('CDN_BUCKET', 'qiliadmin')
CDN_DOMAIN = env.get('CDN_DOMAIN', 'cdn.qili2.com')
KEY_PREFIX = 'pub/teams/'

if not ACCESS_KEY or not SECRET_KEY:
    print('Error: QINIU_ACCESS_KEY / QINIU_SECRET_KEY missing in neox/.env.local')
    sys.exit(1)


def upload_token(key):
    policy = json.dumps({
        'scope': f'{BUCKET}:{key}',
        'deadline': 9999999999,
        'insertOnly': 0,  # allow overwrite
    }).encode()
    encoded = base64.urlsafe_b64encode(policy).decode()
    sign = hmac.new(SECRET_KEY.encode(), encoded.encode(), hashlib.sha1).digest()
    return f'{ACCESS_KEY}:{base64.urlsafe_b64encode(sign).decode()}:{encoded}'


def upload(filepath, key):
    token = upload_token(key)
    boundary = '----TeamMateBoundary'
    ctype = mimetypes.guess_type(filepath)[0] or 'application/octet-stream'
    with open(filepath, 'rb') as f:
        data = f.read()
    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="token"\r\n\r\n{token}\r\n'
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="key"\r\n\r\n{key}\r\n'
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="file"; filename="{os.path.basename(filepath)}"\r\n'
        f'Content-Type: {ctype}\r\n\r\n'
    ).encode() + data + f'\r\n--{boundary}--\r\n'.encode()
    req = urllib.request.Request(
        'https://up.qiniup.com',
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
        method='POST',
    )
    try:
        urllib.request.urlopen(req).read()
        print(f'  ✓ https://{CDN_DOMAIN}/{key}  ({len(data)} bytes, {ctype})')
        return True
    except urllib.error.HTTPError as e:
        print(f'  ✗ {key}: {e.code} {e.read().decode()}')
        return False


def walk():
    count = 0
    failed = 0
    for root, _dirs, files in os.walk(WWW):
        for name in files:
            if name.startswith('.'):
                continue
            full = os.path.join(root, name)
            rel = os.path.relpath(full, WWW)
            key = KEY_PREFIX + rel.replace(os.sep, '/')
            if upload(full, key):
                count += 1
            else:
                failed += 1
    print(f'\nUploaded {count} file(s), {failed} failed.')
    return failed == 0


if __name__ == '__main__':
    print(f'Uploading {WWW} → {BUCKET}/{KEY_PREFIX}\n')
    sys.exit(0 if walk() else 1)
