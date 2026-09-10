#!/usr/bin/env python3
"""Pack the extracted classic cardfaces into an encrypted .bin for the repo.

Reads the packed 7x6 grid of 180x222 faces (quantized),
encrypts with AES-256-GCM, writes public/assets/classic-faces.bin.
Key is embedded in the app source (obfuscation for personal use).
"""
import hashlib
import os
import sys

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SRC = sys.argv[1] if len(sys.argv) > 1 else "grid.png"  # packed 7x6 face grid
DST = "public/assets/classic-faces.bin"
# arbitrary fixed passphrase -> key; ships in src/render/themesheets.ts
PASSPHRASE = b"mj2-personal-2026-classic-faces"
KEY = hashlib.sha256(PASSPHRASE).digest()
# 12-byte nonce, fixed (nonce reuse across the single file is fine for GCM
# as long as key OR nonce changes per message; here there is exactly one
# message ever encrypted under this key)
NONCE = b"mj2classicnc"

def main() -> int:
    data = open(SRC, "rb").read()
    aes = AESGCM(KEY)
    blob = NONCE + aes.encrypt(NONCE, data, None)
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with open(DST, "wb") as f:
        f.write(blob)
    print(f"wrote {DST}: {len(blob)} bytes")
    # self-test: decrypt
    back = AESGCM(KEY).decrypt(blob[:12], blob[12:], None)
    assert back == data, "roundtrip failed"
    print("roundtrip OK")
    return 0

if __name__ == "__main__":
    sys.exit(main())
