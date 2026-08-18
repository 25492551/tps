# Fix managed-wallet key reveal decrypt failure

**When**: 2026-08-11T142055 UTC

## Summary

Admin **키 보기** failed with “Failed to decrypt private key” because ciphertext in the shared Postgres was encrypted under the local `WALLET_KEY_SECRET` while the GCE container used a different prod value. Aligned deploy env to the secret that matches existing `private_key_enc` rows and recreated the app container.

## Changes

- `04_script/deploy/gce/.env` — `WALLET_KEY_SECRET` aligned with DB ciphertext
