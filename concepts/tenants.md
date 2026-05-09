# Tenants

A **tenant** is the unit of isolation in combhq. Each tenant gets exactly one [container](./containers.md), exposed on its own subdomain via a dedicated [tunnel](./tunnels.md).

## Identity

| Field | Purpose |
|---|---|
| `id` | UUID; the immutable handle used everywhere internally. |
| `handle` | Short string (unique). Used as the subdomain — `{handle}.example.com`. |
| `email` | Contact for the operator's records. Not used for auth. |
| `api_key` | Bearer token the tenant uses to authenticate against the [REST API](../api/rest.md). |
| `status` | One of `pending`, `provisioning`, `ready`, `suspended`, `deleted`. |
| `metadata` | Arbitrary JSON. Operator-defined; the platform doesn't interpret it. |

Both `handle` and `api_key` are unique across the deployment. The `api_key` is shown once, on creation, and not retrievable after.

## Lifecycle

```
pending  →  provisioning  →  ready  →  suspended  →  deleted
                              ↑           │
                              └───────────┘
```

- **pending** — row exists, no container yet. Created by `POST /v1/tenants`.
- **provisioning** — a container is being scheduled / started.
- **ready** — container is running and the subdomain is live.
- **suspended** — operator-paused. Container stopped, tunnel kept.
- **deleted** — container removed, tunnel and DNS torn down. Row retained for audit.

The transition from `pending` to `provisioning` happens implicitly the first time you call `POST /v1/containers` for the tenant.

## One container per tenant

This is a hard rule for v1. The data model enforces it: `containers.tenant_id` is `UNIQUE`. If you need a tenant to run multiple workloads, run multiple tenants.

Why: the per-tenant subdomain, the bin-packing model, and the reconciler all assume a 1:1 mapping. Relaxing this is a [deferred decision](../roadmap.md#open-questions); see "Multi-tenant containers".

## See also

- [Containers](./containers.md) — what gets scheduled when a tenant becomes active.
- [Tunnels](./tunnels.md) — how a tenant's subdomain reaches its container.
- [REST API → tenants](../api/rest.md#tenants) — endpoints for create, read, delete.
