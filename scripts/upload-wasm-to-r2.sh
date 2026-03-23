#!/usr/bin/env bash
# upload-wasm-to-r2.sh — One-time (or post-upgrade) upload of WASM binaries to R2.
#
# These files must exist in the bucket before deploying the worker.
# They are fetched at runtime by photonLoader.js and avifEncode.js instead of
# being bundled, which keeps the worker well under the 10 MB script size limit.
#
# Usage:
#   npm run wasm:upload
#
# Requires wrangler to be installed and authenticated (wrangler login).
# The bucket name is read from wrangler.jsonc via the S3_BUCKET_NAME var.

set -euo pipefail

BUCKET="sofiacerne"
PREFIX="_wasm"

PHOTON_WASM="node_modules/@cf-wasm/photon/dist/lib/photon_rs_bg.wasm"
AVIF_ENC_WASM="node_modules/@jsquash/avif/codec/enc/avif_enc.wasm"
AVIF_DEC_WASM="node_modules/@jsquash/avif/codec/dec/avif_dec.wasm"

for f in "$PHOTON_WASM" "$AVIF_ENC_WASM" "$AVIF_DEC_WASM"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: $f not found. Run 'npm install' first." >&2
    exit 1
  fi
done

upload() {
  local src="$1"
  local key="$2"
  echo "Uploading $src → r2://${BUCKET}/${key}"
  wrangler r2 object put "${BUCKET}/${key}" \
    --file "$src" \
    --content-type "application/wasm"
}

upload "$PHOTON_WASM"   "${PREFIX}/photon_rs_bg.wasm"
upload "$AVIF_ENC_WASM" "${PREFIX}/avif_enc.wasm"
upload "$AVIF_DEC_WASM" "${PREFIX}/avif_dec.wasm"

echo ""
echo "Done. The worker will fetch WASM from:"
echo "  \$S3_PUBLIC_URL/_wasm/photon_rs_bg.wasm"
echo "  \$S3_PUBLIC_URL/_wasm/avif_enc.wasm"
echo "  \$S3_PUBLIC_URL/_wasm/avif_dec.wasm"
