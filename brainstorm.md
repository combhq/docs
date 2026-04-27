# combhq — Architecture Brainstorm

> Working document. Pre-implementation. Some items deferred (marked accordingly).
> GitHub org: `combhq`

---

## 1. What we're building

**A platform for spawning and managing per-tenant containers (and the hosts they run on) across any infrastructure — cloud, bare metal, or local machines.**

The core capability: an operator (or end user, depending on how it's deployed) requests a container with some configuration, and the platform picks a host with capacity, runs the container there, exposes it on a stable subdomain via Cloudflare Tunnel, and manages its lifecycle.

### Workloads it can run

The platform is workload-agnostic. The container image is config. Examples:

- **LLM proxy / API gateway** — forward requests to OpenAI/Anthropic with per-user keys, rate limits, logging
- **Per-user databases / caches** — Postgres-per-tenant, Redis-per-tenant
- **Sandboxed compute** — code execution, untrusted-input processing
- **Per-customer SaaS instances** — single-tenant deployments of an app
- **Bot / automation runners** — scheduled jobs, scrapers, integrations
- **Dev environments** — give each developer an isolated remote workspace
- **CI / build runners** — ephemeral or long-lived

The original design was driven by the LLM proxy use case, but nothing in the architecture is LLM-specific.

### What it is not

- Not Kubernetes. No pods, no DaemonSets, no operators. Simpler model: one container per tenant, hosts are bin-packed.
- Not a function runtime. Containers are long-lived (days+), not request-scoped.
- Not a PaaS for end users. Operators run it; end users get a subdomain.
- Not multi-region (yet). Single-region per deployment for v1.

---

## 2. Core requirements

| Requirement | Decision |
|---|---|
| Tenant isolation | Per-tenant container, 1:1 |
| Long-running containers | Persistent; restart on failure |
| Operator-managed via API | REST for users + admins, gRPC for agents |
| Provider-agnostic | No cloud-specific hard dependencies; works on any Linux + Docker |
| Bin-pack tenants per host | Yes; capacity planner picks host |
| Per-tenant subdomain | Cloudflare Tunnel + DNS, one tunnel per tenant |
| Pluggable workload images | Image + env config per tenant |
| Per-tenant outbound IP | **Deferred** — design leaves seams (egress assignment, proxy_pool table) |

Things explicitly **not** in scope for v1:
- Per-tenant outbound IP isolation (proxy pool sketched but not built)
- SSH/shell access to tenant containers
- User-uploaded images (only operator-curated images for now)
- Multi-region deployment
- Stateful workloads with cross-host migration (containers assumed stateless or with host-local volumes only)

---

## 3. High-level architecture

Three tiers:

```
┌─────────────────────────────────────────────────┐
│  TIER 1 — EDGE                                  │
│  End user → Cloudflare → Tunnel                 │
│  Subdomain: {tenant}.example.com                │
└──────────────────┬──────────────────────────────┘
                   │ tunnels (outbound from container)
                   ▼
┌─────────────────────────────────────────────────┐
│  TIER 2 — DATA PLANE  (hosts)                   │
│  Hosts (any Linux + Docker):                    │
│    • Cloud VM (auto-provisioned via driver)     │
│    • Bare metal / on-prem                       │
│    • Local dev machine                          │
│  Each host runs:                                │
│    • N tenant containers                        │
│    • Agent (one stream to control plane)        │
└──────────────────┬──────────────────────────────┘
                   │ persistent gRPC stream
                   │ (commands ↓ + heartbeat/state ↑)
                   ▼
┌─────────────────────────────────────────────────┐
│  TIER 3 — CONTROL PLANE                         │
│  • REST API (users, admins)                     │
│  • gRPC server (agent streams)                  │
│  • Job worker (river queue)                     │
│  • Postgres (state)                             │
│  • Provider drivers (pluggable)                 │
└─────────────────────────────────────────────────┘
```

### Key design principles

1. **Cloudflare Tunnel for ingress.** Removes public IPs, security groups, TLS management, DDoS handling.
2. **Agent-pull model.** The agent on each host opens an outbound connection to the control plane. No SSM, no SSH, no inbound ports. Works behind NAT.
3. **Provider-agnostic.** A host is any Linux box running the agent. Cloud VMs, bare metal, and laptops are interchangeable.
4. **Containers are independent of the control plane.** If the control plane goes down, tenant traffic keeps flowing.
5. **Slow reactions over fast panic.** On disconnect, do not auto-terminate or re-provision. The reconciler resolves drift.
6. **Workload-agnostic.** The container image is config. The platform doesn't care what the container does.

---

## 4. Repo layout under `combhq/`

The org will host multiple repos for clean separation:

```
combhq/control-plane    # REST API + gRPC server + job worker + DB
combhq/agent            # On-host daemon
combhq/proto            # Shared gRPC .proto files; vendored by control-plane + agent
combhq/drivers          # Provider drivers (manual, hetzner, aws, ...)
combhq/install          # Install script for BYOH; cloud-init templates
combhq/cli              # Operator/admin CLI
combhq/images           # Reference container images for tenants (LLM proxy, sandbox, etc.)
combhq/terraform        # IaC for deploying the control plane itself
combhq/docs             # Public docs site
combhq/.github          # Org-wide profile, issue templates, CI workflows
```

---

## 5. Components

### 5.1 Edge — Cloudflare

- **Tunnels** — one per tenant container. Created via Cloudflare API on provisioning.
- **DNS** — `CNAME {tenant_handle}.example.com → {tunnel_id}.cfargotunnel.com`.
- **Why per-tenant (not per-host) tunnels** — cleaner isolation, easier teardown when a tenant leaves; cost is small (free tier covers a lot).

### 5.2 Data plane — hosts

- **Host = any Linux machine with Docker + agent installed.**
- **Containers** — one per tenant. Run two processes (or use a sidecar): the workload + cloudflared.
  - Resource limits: `--memory`, `--cpus`, `--pids-limit`. Required from day one to prevent runaway containers from killing neighbors.
  - Restart policy: `unless-stopped`.
- **Agent** — small Go binary. Responsibilities:
  - Maintain persistent gRPC stream to the control plane
  - Execute commands (run/stop containers, fetch images)
  - Report heartbeats (every ~30s) with container states
  - Local buffer of state changes for replay during disconnects
  - Discover existing containers on startup via `docker ps` (survives agent restart)

### 5.3 Control plane (Go)

Single Go binary running multiple components (or split across binaries — TBD):

- **REST API server** — public tenant endpoints + admin endpoints. Library: `chi` or `echo`.
- **gRPC server** — bidirectional stream endpoint for agents. Same process as REST.
- **Job worker** — drains job queue, runs provisioning. Library: **river** (Postgres-backed).
- **Postgres** — single source of truth.
- **Provider drivers** — pluggable; only used when auto-provisioning hosts.

---

## 6. Provider abstraction

### 6.1 Driver interface

```go
type Driver interface {
    Name() string
    Provision(ctx, spec) (HostInfo, error)
    Terminate(ctx, providerID) error
    Capabilities() Capabilities
}
```

Implementations to consider (priority order):
1. `manual` — no-op driver. Hosts register themselves via install script. Always supported.
2. `hetzner` — cheapest cloud option for early scaling.
3. `aws` — for compliance / corporate users.
4. `gcp`, `digitalocean`, `vultr` — as needed.

### 6.2 Two ways a host enters the system

**Manual / BYOH (Bring Your Own Host):**
```bash
curl https://combhq.example.com/install.sh | TOKEN=xyz sh
# Agent installs, connects, host appears in DB
```

**Auto-provisioned via cloud driver:**
- Operator (or capacity planner) requests new host with provider preference
- Job worker calls `driver.Provision` → cloud VM is created
- Cloud-init installs agent with bootstrap token
- Agent connects, host appears in DB (same path as manual from this point)

### 6.3 Bootstrap tokens

- One-time-use, short TTL (~15 min)
- Exchanged for long-lived host credential on first connect
- Prevents leaked install commands from being usable later

---

## 7. Data model (Postgres)

```sql
tenants (
  id UUID PK,
  handle TEXT UNIQUE,             -- used in subdomain
  email TEXT,
  api_key TEXT UNIQUE,
  status TEXT,                    -- pending|provisioning|ready|suspended|deleted
  metadata JSONB,                 -- arbitrary tenant-level config
  created_at, updated_at
)

hosts (
  id UUID PK,
  provider TEXT,                  -- aws|hetzner|manual|...
  provider_id TEXT NULL,          -- instance ID, null for manual
  provider_metadata JSONB,        -- region, tier, anything provider-specific
  bootstrap_token TEXT NULL,      -- cleared after first connect
  agent_version TEXT,
  connection_id TEXT NULL,        -- which control plane instance holds the live stream
  capacity INT,
  current_load INT DEFAULT 0,
  status TEXT,                    -- launching|ready|unhealthy|unreachable|draining|terminated
  last_heartbeat_at TIMESTAMPTZ,
  labels JSONB,                   -- for placement constraints (e.g., {"region": "eu", "tier": "premium"})
  created_at TIMESTAMPTZ
)

containers (
  id UUID PK,
  tenant_id UUID UNIQUE REFERENCES tenants,
  host_id UUID REFERENCES hosts,
  docker_id TEXT,
  image TEXT,                     -- the container image to run
  handle TEXT UNIQUE,             -- subdomain handle
  cf_tunnel_id TEXT,
  cf_tunnel_token_encrypted BYTEA,
  status TEXT,
  config JSONB,                   -- env, limits, future: egress assignment
  created_at, updated_at
)

jobs (river-managed table)

-- Future, for outbound IP isolation:
-- proxy_pool (id, provider, endpoint, credentials, assigned_tenant_id, status, ...)
```

Encrypt secrets at rest (envelope encryption recommended).

---

## 8. Provisioning flow

### 8.1 Container provisioning (happy path)

1. `POST /v1/containers` (or `POST /v1/tenants` if tenant doesn't exist) → DB insert (status=pending), enqueue `provision_container` job, return 202.
2. Job worker picks up job:
   1. **Idempotency** — if container exists for tenant, return.
   2. **Pick host** — `SELECT … WHERE status='ready' AND current_load < capacity ORDER BY current_load DESC LIMIT 1 FOR UPDATE SKIP LOCKED`. Increment `current_load`. If no host: enqueue `provision_host`, reschedule self in 60s.
   3. **Cloudflare** — create tunnel, create DNS CNAME, get tunnel token.
   4. **Insert container row** (status=creating).
   5. **Send command via agent stream** — `RunContainer(image, env, limits)`.
   6. **Wait for confirmation** from agent (timeout ~60s).
   7. **Verify tunnel health** via Cloudflare API.
   8. **Mark tenant ready**.
3. Cleanup on failure (decrement `current_load`, leave the rest for the reconciler).

### 8.2 Host provisioning (driver-based)

1. Job worker checks current capacity vs warm-pool target.
2. Calls `driver.Provision(spec)`.
3. Cloud VM boots, cloud-init installs agent with bootstrap token.
4. Agent connects to control plane (gRPC handshake → register → exchange bootstrap token for credential).
5. Host marked `ready`.

### 8.3 Deprovisioning (container)

1. Send `StopContainer` via agent stream.
2. Delete Cloudflare DNS record.
3. Delete Cloudflare Tunnel.
4. Decrement host's `current_load`.
5. If host has 0 containers and isn't the last warm host: enqueue `terminate_host` (after a grace period — avoid thrash).

---

## 9. Connection & failure handling

### 9.1 The agent stream

- **Protocol:** gRPC bidirectional streaming (alternative considered: WebSocket+JSON; gRPC won for typed schemas + tooling).
- **Direction:** Agent dials control plane. Single TCP connection, multiplexed.
- **Keepalive:** 30s server pings, 10s timeout. Detects dead connections in seconds rather than minutes.

### 9.2 Disconnect — agent side

- **Containers keep running.** The agent never kills containers because the control plane is unreachable. This is the most important rule in the system.
- **Reconnect with exponential backoff + jitter** (1s, 2s, 4s, ..., capped at 60s, ±20% jitter). Jitter prevents thundering herd on control plane restart.
- **Reconnect forever.** No "give up" state.
- **Buffer state changes locally** while disconnected (bounded, ~100 events). Replay on reconnect.

### 9.3 Disconnect — control plane side

Three-layer detection:
1. **gRPC keepalive** — sub-second detection of fast disconnects.
2. **In-memory stream registry** — server flips `connected=false` when stream closes.
3. **DB heartbeat watcher** — periodic check for stale `last_heartbeat_at`, safety net.

Host state machine:
- `ready` — connected, accepting work, heartbeat fresh.
- `unhealthy` — no heartbeat in 3× interval. **Stop assigning new containers**, leave existing alone, alert.
- `unreachable` — no heartbeat in 10× interval. Investigate, maybe page.
- `terminated` — confirmed dead (operator or driver). Re-provision affected tenants.

**Critical rule:** disconnected ≠ dead. A 60s blip should not trigger re-provisioning. Slow reactions > fast panic.

### 9.4 Commands during disconnect

For new container provisioning, **prefer routing to a different healthy host** rather than waiting for the disconnected one. Workloads are fungible.

### 9.5 Reconnect handshake

On reconnect, agent sends full container inventory. Control plane compares to DB:
- Match → no action
- Container exists in DB but not on host → mark for re-provisioning
- Container exists on host but not in DB → orphan; investigate or remove

### 9.6 Control plane HA

- Run 2+ control plane instances behind a load balancer.
- Agents will reconnect to whichever instance is up; sticky routing not required.
- DB is source of truth; in-memory stream registry is per-instance (use `connection_id` in `hosts` table to find which instance holds a given agent).

### 9.7 Reconciler

Periodic job (every 5 min) that compares external reality to DB:
- Hosts: for each provider driver, list known instances; flag orphans + missing.
- Cloudflare tunnels: list all, delete orphans older than grace period.
- Containers: agent inventory vs DB.

The single most important defensive job in the system.

---

## 10. Tech stack decisions

| Component | Choice | Reason |
|---|---|---|
| Language | Go | Concurrency primitives, single binary deploy, gRPC ecosystem |
| HTTP framework | chi (or echo) | Lightweight, idiomatic |
| RPC for agents | gRPC | Bidirectional streaming, typed schemas, codegen on both sides |
| Job queue | river | Postgres-backed (no Redis), transactional enqueue, simpler ops |
| DB | Postgres | Standard choice; single source of truth |
| DB access | sqlc + pgx | Type-safe queries from SQL |
| Logging | slog (stdlib) or zerolog | Structured, performant |
| Config | viper or stdlib `flag` + env | Whatever is simplest |
| Migrations | golang-migrate or goose | Either works |
| Edge | Cloudflare Tunnel | Removes huge swaths of complexity (TLS, DDoS, public IPs) |
| Provisioning | Pluggable drivers; first ones: manual, hetzner | Manual works for dev/prototyping; hetzner cheapest cloud |

### REST + gRPC together

The control plane runs both:
- REST on one port (e.g., 8080) — for tenants, admins, browsers, curl
- gRPC on another (e.g., 8443) — for agents

Both share Postgres, business logic, and the job queue. Standard pattern (Kubernetes, Nomad, Consul all do something analogous).

---

## 11. API surface (sketch)

### Public (tenants)
```
POST   /v1/tenants                       register tenant
GET    /v1/tenants/:id                   status
DELETE /v1/tenants/:id                   deprovision

POST   /v1/containers                    create container for tenant
GET    /v1/containers/:id                status
DELETE /v1/containers/:id                stop and remove
```

### Admin
```
GET    /v1/admin/hosts
POST   /v1/admin/hosts                   manual provision
POST   /v1/admin/hosts/:id/drain
DELETE /v1/admin/hosts/:id

GET    /v1/admin/containers
POST   /v1/admin/containers/:id/restart
POST   /v1/admin/containers/:id/migrate

GET    /v1/admin/jobs
POST   /v1/admin/jobs/:id/retry

GET    /v1/admin/stats
```

### Host registration
```
POST   /v1/hosts/register                bootstrap token → host credential
                                         (called once by agent on first connect)
```

### Agent stream (gRPC)
```
service AgentService {
  rpc Connect(stream AgentMessage) returns (stream ServerMessage);
}
```
Messages: `Heartbeat`, `RunContainer`, `StopContainer`, `ContainerStateChanged`, `ContainerInventory` (for reconnect).

---

## 12. Build order (roadmap)

Roughly 8-week plan; ship to first real users around week 6–8.

### Week 1 — Manual end-to-end validation
- Spin up one host (any Linux box, even a laptop)
- Install Docker, run a hello-world container with `cloudflared` sidecar
- Confirm `test.example.com` works from outside
- Document everything; this becomes the install script

### Week 2 — Agent + protocol
- Define gRPC `.proto` (in `combhq/proto`)
- Build agent binary (`combhq/agent`): connect, heartbeat, run/stop container, inventory
- Build minimal control plane that accepts connections (no DB yet, just logging)

### Week 3 — Control plane skeleton
- Postgres + migrations + sqlc setup
- REST API: `POST /v1/tenants`, `POST /v1/containers`, basic admin endpoints
- river job queue
- Job worker that processes jobs (faked driver/CF calls for now)

### Week 4 — Cloudflare integration
- Real CF tunnel + DNS creation in job worker
- Test end-to-end with manually-launched host from week 1
- Deprovisioning + cleanup

### Week 5 — Driver interface + manual driver
- Driver interface defined (`combhq/drivers`)
- Manual driver implemented (basically a no-op + token issuance)
- Install script (`combhq/install`) for BYOH
- Bootstrap token lifecycle

### Week 6 — Bin packing + multi-host
- Capacity planner in `provision_container`
- Test with 5–10 concurrent tenants on 2–3 hosts
- Watch what breaks

### Week 7 — Reconciler + admin tooling
- Drift detection (CF orphans, container inventory mismatch)
- Admin endpoints actually wired up
- CLI (`combhq/cli`)

### Week 8 — Hardening
- Disconnect handling tests (kill agent, kill network, restart control plane)
- Retry policies, dead-letter queue
- Alerting (host unhealthy, capacity %, failed provisions)
- Load test with 50+ tenants

### After v1
- Reference container images (`combhq/images`): LLM proxy, sandbox, etc.
- Cloud driver (hetzner first, then aws)
- Outbound IP isolation (proxy_pool, egress assignment)
- HA control plane (2+ instances)
- Cost controls (auto-stop idle hosts, alerts on instance growth)
- Public docs site (`combhq/docs`)

---

## 13. Open questions / decisions deferred

- **IP isolation strategy** — proxy pool likely best when added. Requires picking a provider (datacenter / ISP / residential).
- **One-tunnel-per-container vs one-tunnel-per-host** — going with per-container; revisit if Cloudflare API call volume becomes a problem.
- **Container statefulness** — assuming stateless for v1. If workloads need persistent state, will need volumes and migration logic.
- **Subdomain pattern** — `{handle}.example.com` for v1, where `handle` is operator-controlled or derived from tenant ID. Custom domains later.
- **Auth model** — API keys (simple, stateless). OAuth/OIDC later if needed.
- **Multi-tenant containers** — for now, one container = one tenant. Later, could support shared containers with isolated logical tenants for cost optimization on light workloads.
- **Image distribution** — Docker Hub / GHCR / private registry? Pinning vs floating tags?
- **Pricing / billing model** — out of scope for this doc.
- **Geographic routing** — single region for v1. Multi-region later (hosts labeled by region; placement honors tenant region preference).

---

## 14. Things that bite (lessons baked in)

A short list of failure modes the design accounts for:

- **Thundering herd on reconnect** → exponential backoff + jitter
- **Disconnect ≠ dead** → host state machine with `unhealthy` intermediate state
- **Orphaned cloud resources** → reconciler with grace period before cleanup
- **Half-finished provisioning** → idempotent jobs, all writes use deterministic IDs
- **Capacity counter drift** → defer-decrement on error path; reconciler verifies
- **Runaway containers killing neighbors** → resource limits from day one
- **Unbounded log/cost growth** → tag every resource with tenant_id; alert on growth rate
- **Bootstrap token leaks** → short TTL, one-time use
- **Bad install script** → manual e2e validation in week 1 before automation
- **Image pull failure during provisioning** → container goes to `failed`, retry policy with image cache on hosts

---

## 15. What we explicitly chose NOT to do

| Path | Why not |
|---|---|
| Kubernetes / ECS / Nomad | Overkill at this scale; one workload per container, ≤100s of containers initially |
| Per-tenant VM (instead of container) | Too expensive; bin-packing on shared hosts is the win |
| Cloud-native lock-in (SSM, ENIs, EIPs, etc.) | Locks us in; replaced by agent-pull model and pluggable drivers |
| SSH-based remote control | Key management is painful; agent-pull is cleaner |
| One-shot polling agents | High latency, wastes bandwidth, hammers DB |
| Per-container dedicated public IPs (ENI/EIP) | Complex setup, provider quotas; proxy pool is the better model |
| Real residential proxy from day one | External dependency; layer in via proxy_pool when needed |
| LLM-specific design choices | Workload-agnostic platform; LLM proxy is just one image |