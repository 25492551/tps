#!/usr/bin/env bash
# Create A records for bgp-001.com → this VM (DNS only / grey cloud).
# Requires CLOUDFLARE_API_TOKEN with Zone.DNS Edit on bgp-001.com.
set -euo pipefail

TOKEN="${CLOUDFLARE_API_TOKEN:-}"
if [[ -z "$TOKEN" && -f /opt/tps/.env ]]; then
  TOKEN=$(python3 -c "from pathlib import Path
for line in Path('/opt/tps/.env').read_text().splitlines():
  if line.startswith('CLOUDFLARE_API_TOKEN='):
    print(line.split('=',1)[1].strip())")
fi
[[ -n "$TOKEN" ]] || { echo "CLOUDFLARE_API_TOKEN required"; exit 1; }

ZONE_ID=82c45a7fee3b2bad68a99bd477ae59d4
IP="${TPS_PUBLIC_IP:-136.85.20.216}"
API=https://api.cloudflare.com/client/v4

upsert() {
  local name="$1"
  local list
  list=$(curl -sS -H "Authorization: Bearer $TOKEN" \
    "$API/zones/$ZONE_ID/dns_records?type=A&name=$name")
  if ! echo "$list" | python3 -c 'import sys,json; raise SystemExit(0 if json.load(sys.stdin).get("success") else 1)'; then
    echo "DNS API auth failed for $name — need Zone.DNS Edit token"
    echo "$list"
    exit 1
  fi
  local id
  id=$(echo "$list" | python3 -c 'import sys,json; r=json.load(sys.stdin).get("result") or []; print(r[0]["id"] if r else "")')
  local body
  body=$(python3 -c "import json; print(json.dumps({'type':'A','name':'''$name''','content':'''$IP''','ttl':1,'proxied':False}))")
  if [[ -n "$id" ]]; then
    curl -sS -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      "$API/zones/$ZONE_ID/dns_records/$id" --data "$body" | python3 -m json.tool
  else
    curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      "$API/zones/$ZONE_ID/dns_records" --data "$body" | python3 -m json.tool
  fi
}

upsert "bgp-001.com"
upsert "www.bgp-001.com"
echo "Done. Wait for DNS, then Caddy will obtain TLS certs."
