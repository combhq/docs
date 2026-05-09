# Containers

A **container** is the actual running workload for a [tenant](./tenants.md). One per tenant, scheduled onto a [host](./hosts.md), exposed via a [tunnel](./tunnels.md).

## Anatomy

Each tenant container runs two processes (or uses a sidecar):

- The **workload** — whatever image the operator picked (LLM proxy, Postgres, your app, etc.).
- **`cloudflared`** — the Cloudflare Tunnel client that exposes the workload on the tenant's subdomain.

Container settings on the Docker side, applied on day one (these are not optional):

| Setting | Why |
|---|---|
| `--memory` | Prevents one tenant from OOM-killing its neighbors. |
| `--cpus` | Same, but for CPU. |
| `--pids-limit` | Stops a fork-bomb from cratering the host. |
| `--restart unless-stopped` | Keeps the container alive across host reboots and crashes. |

## Lifecycle

```
pending  →  creating  →  ready  →  stopping  →  deleted
                          ↓ ↑                          
                         failed                        
```

- **pending** — row inserted; provisioning job queued.
- **creating** — host picked, tunnel created, `RunContainer` command sent to the agent.
- **ready** — agent confirmed the container is up; tunnel verified by the control plane.
- **failed** — image pull failed, agent timeout, or host disappeared mid-create. Retried per policy; eventually moved to dead-letter for operator attention.
- **stopping** — `StopContainer` command in flight.
- **deleted** — container gone, tunnel + DNS torn down.

The end-to-end provisioning sequence is documented in [REST API → containers](../api/rest.md#containers).

## Configuration

The `config` field on the container is JSON, currently with:

```json
{
  "env": { "KEY": "value", ... },
  "limits": {
    "memory_mb": 512,
    "cpus": 1.0,
    "pids": 500
  }
}
```

Future seams already in the data model:

- **Egress assignment** — once outbound IP isolation lands ([roadmap](../roadmap.md)), the assigned proxy will live under `config`.
- **Volumes** — host-local volumes for stateful workloads. Not in v1; see [non-goals](../what-it-is-not.md).

## Independence from the control plane

A running container does **not** depend on the control plane being reachable. If the control plane is down:

- Existing containers keep serving traffic.
- Tunnels keep working (`cloudflared` talks directly to Cloudflare's edge).
- The agent buffers state changes locally and replays them on reconnect.

The control plane being unreachable means no new provisioning, not service interruption.

## Reconnect handshake

When an agent reconnects after a disconnect, it sends a full container inventory. The control plane compares it against the database:

| State | Action |
|---|---|
| In DB and on host | No action. |
| In DB, missing on host | Mark for re-provisioning. |
| On host, missing from DB | Orphan — investigate or remove. |

This is what makes "slow reactions over fast panic" safe: if the network heals, everything reconciles.

## See also

- [Tenants](./tenants.md) — the owner of a container.
- [Hosts](./hosts.md) — where containers run.
- [Tunnels](./tunnels.md) — how containers are exposed.
- [REST API → containers](../api/rest.md#containers).
