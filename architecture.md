# Architecture

combhq is structured as three tiers: edge, data plane, and control plane.

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

## Tier 1 — Edge

Cloudflare handles ingress. Each tenant container has its own [tunnel](./concepts/tunnels.md), bound to a CNAME on the operator's domain. There are no public IPs on the data plane, no security groups to manage, and no TLS termination to configure on the host.

## Tier 2 — Data plane (hosts)

A [host](./concepts/hosts.md) is any Linux box with Docker and the combhq agent installed. Cloud VMs, bare metal servers, and developer laptops are interchangeable from the control plane's point of view.

Each host runs:

- N tenant [containers](./concepts/containers.md) (resource-limited, restart-on-failure).
- One agent process. The agent maintains a single outbound gRPC stream to the control plane and receives commands over it.

Because the agent dials out, hosts work behind NAT and need no inbound ports.

## Tier 3 — Control plane

A single Go service (or a small set, depending on deployment) that exposes:

- A **REST API** for tenants and admins.
- A **gRPC server** that accepts agent streams.
- A **job worker** ([river](https://riverqueue.com/)) that drives provisioning, deprovisioning, and reconciliation.
- A **Postgres** database that is the single source of truth.
- Pluggable **[drivers](./concepts/drivers.md)** for cloud auto-provisioning.

REST and gRPC live in the same process and share the same database and business logic. (Standard pattern; Kubernetes, Nomad, and Consul all do something analogous.)

## Key design principles

1. **Cloudflare Tunnel for ingress.** Removes public IPs, security groups, TLS management, DDoS handling.
2. **Agent-pull model.** The agent on each host opens an outbound connection to the control plane. No SSM, no SSH, no inbound ports. Works behind NAT.
3. **Provider-agnostic.** A host is any Linux box running the agent. Cloud VMs, bare metal, and laptops are interchangeable.
4. **Containers are independent of the control plane.** If the control plane goes down, tenant traffic keeps flowing.
5. **Slow reactions over fast panic.** On disconnect, do not auto-terminate or re-provision. The reconciler resolves drift.
6. **Workload-agnostic.** The container image is config. The platform doesn't care what the container does.

## Repo layout

The `combhq` org is split across several repos for clean separation:

```
combhq/control-plane    # REST API + gRPC server + job worker + DB
combhq/agent            # On-host daemon
combhq/proto            # Shared gRPC .proto files; vendored by control-plane + agent
combhq/drivers          # Provider drivers (manual, hetzner, aws, ...)
combhq/install          # Install script for BYOH; cloud-init templates
combhq/cli              # Operator/admin CLI
combhq/images           # Reference container images for tenants
combhq/terraform        # IaC for deploying the control plane itself
combhq/docs             # This site
combhq/.github          # Org-wide profile, issue templates, CI workflows
```

## See also

- [Concepts → Containers](./concepts/containers.md) for the per-tenant container model.
- [Concepts → Drivers](./concepts/drivers.md) for the provider abstraction.
- The full original design doc: [brainstorm](./brainstorm.md).
