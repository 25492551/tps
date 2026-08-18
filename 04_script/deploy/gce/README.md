# TPS on GCE (shared with S01)

Same VM / Caddy as **bg-demo001.uk** (S01). Hostnames must not collide.

| Host | Upstream | Container |
|------|----------|-----------|
| `bg-demo001.uk`, `www.bg-demo001.uk` | `s01:3001` | `gce-s01-1` |
| `bgp-001.com`, `www.bgp-001.com` | `tps:3002` | `gce-tps-1` |

Caddyfile lives in **S01** deploy: `/opt/s01/04_script/deploy/gce/Caddyfile` (ports 80/443).

## Cloudflare DNS (required)

Point **DNS only** (grey cloud) at this VM static IP `136.85.20.216`:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `136.85.20.216` | DNS only |
| A | `www` | `136.85.20.216` | DNS only |

Then Caddy issues Let's Encrypt certs automatically.

```bash
# If you have a token with Zone.DNS Edit:
export CLOUDFLARE_API_TOKEN=...
./set-dns.sh
```

## Bring up TPS

```bash
cd /opt/tps/04_script/deploy/gce
docker compose up -d --build
docker exec gce-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Postgres: host container `tps-pg` must be on Docker network `gce_s01`  
(`docker network connect gce_s01 tps-pg`).

## Notes

- TPS listens on **3002** inside Docker (S01 keeps **3001**).
- Compose project name is `tps` so it does not steal S01’s `gce` project.
- Do not publish host ports 80/443 from TPS — Caddy owns them.
