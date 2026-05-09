# REST API

::: warning Hand-written reference (TODO: auto-generate)
This page is hand-written from the design doc ([brainstorm §11](../brainstorm.md)). Once `combhq/control-plane` exposes `/openapi.yaml` ([task #18](https://github.com/combhq/control-plane/issues/18)), this page should be regenerated from that spec — likely via a VitePress OpenAPI plugin — so the docs cannot drift from the implementation.
:::

The control plane exposes a JSON REST API on its public port (8080 by default). All endpoints return JSON and accept `Content-Type: application/json` for request bodies.

## Conventions

- **Versioning** — every public endpoint is prefixed with `/v1`. Breaking changes will ship under `/v2`.
- **Auth** — `Authorization: Bearer <token>`. Tenant endpoints accept the tenant `api_key`. Admin endpoints require an admin key.
- **IDs** — UUIDs.
- **Timestamps** — RFC 3339 / ISO 8601, UTC.
- **Provisioning is asynchronous.** Endpoints that trigger provisioning return `202 Accepted` with the resource in `pending`; poll the resource (or wait for a webhook, when those land) to see it move to `ready`.

## Tenants

Endpoints for tenant lifecycle. See [Concepts → Tenants](../concepts/tenants.md).

### `POST /v1/tenants`

Register a new tenant. Returns the tenant record including a one-time `api_key` (not retrievable later).

**Request**

```json
{
  "handle": "acme",
  "email": "ops@acme.example",
  "metadata": { "plan": "starter" }
}
```

**Response — `201 Created`**

```json
{
  "id": "5b2a4c8e-1f7e-4a3b-9c4d-1234567890ab",
  "handle": "acme",
  "email": "ops@acme.example",
  "api_key": "cmb_tenant_acme_...",
  "status": "pending",
  "metadata": { "plan": "starter" },
  "created_at": "2026-05-08T14:02:11Z",
  "updated_at": "2026-05-08T14:02:11Z"
}
```

### `GET /v1/tenants/:id`

Returns the current tenant record (without the `api_key`).

### `DELETE /v1/tenants/:id`

Deprovisions the tenant: stops and removes its container, deletes its tunnel, deletes its CNAME, then marks the tenant `deleted`. Returns `202 Accepted`.

## Containers

Endpoints for the per-tenant workload. See [Concepts → Containers](../concepts/containers.md).

### `POST /v1/containers`

Create the container for a tenant. The control plane picks a host, creates a tunnel, and dispatches a `RunContainer` command to the host's agent. Returns `202 Accepted`.

**Request**

```json
{
  "tenant_id": "5b2a4c8e-1f7e-4a3b-9c4d-1234567890ab",
  "image": "ghcr.io/combhq/images/hello:latest",
  "config": {
    "env": { "GREETING": "hi from combhq" },
    "limits": { "memory_mb": 256, "cpus": 0.5, "pids": 200 }
  }
}
```

**Response — `202 Accepted`**

```json
{
  "id": "9f8e7d6c-5b4a-3210-fedc-ba9876543210",
  "tenant_id": "5b2a4c8e-1f7e-4a3b-9c4d-1234567890ab",
  "host_id": null,
  "image": "ghcr.io/combhq/images/hello:latest",
  "handle": "acme",
  "status": "pending",
  "config": {
    "env": { "GREETING": "hi from combhq" },
    "limits": { "memory_mb": 256, "cpus": 0.5, "pids": 200 }
  },
  "created_at": "2026-05-08T14:02:14Z",
  "updated_at": "2026-05-08T14:02:14Z"
}
```

::: tip Status transitions
`pending → creating → ready` is the happy path. `failed` is the terminal-but-retryable state; see [Concepts → Containers](../concepts/containers.md) for the full state machine.
:::

### `GET /v1/containers/:id`

Returns the current container record.

### `DELETE /v1/containers/:id`

Stops and removes the container, then tears down its tunnel and DNS record. Returns `202 Accepted`.

## Admin — hosts

These endpoints require an admin key. See [Concepts → Hosts](../concepts/hosts.md).

### `GET /v1/admin/hosts`

List all hosts known to the control plane.

### `POST /v1/admin/hosts`

Manually add (or auto-provision via driver) a host. Body shape varies by driver; for `manual`:

```json
{
  "provider": "manual",
  "labels": { "region": "eu-1", "tier": "premium" },
  "capacity": 10
}
```

Returns the bootstrap install command for `manual` hosts:

```json
{
  "id": "8c1a4b2e-...",
  "provider": "manual",
  "status": "launching",
  "bootstrap_token": "brt_...",
  "install_command": "curl -fsSL https://control.example.com/install.sh | TOKEN=brt_... sh"
}
```

### `POST /v1/admin/hosts/:id/drain`

Marks the host `draining`. Stops accepting new containers; existing containers are scheduled to migrate off. Returns `202 Accepted`.

### `DELETE /v1/admin/hosts/:id`

Terminates the host (calls `driver.Terminate` if the host was driver-provisioned). Affected tenants are re-provisioned elsewhere by the reconciler.

## Admin — containers

### `GET /v1/admin/containers`

List all containers, with optional filters (e.g. `?host_id=...`, `?status=ready`).

### `POST /v1/admin/containers/:id/restart`

Restart the container in place (same host).

### `POST /v1/admin/containers/:id/migrate`

Move the container to a different host. Body:

```json
{ "target_host_id": "..." }
```

If `target_host_id` is omitted, the capacity planner picks one.

## Admin — jobs

### `GET /v1/admin/jobs`

List recent jobs from the [river](https://riverqueue.com/) queue.

### `POST /v1/admin/jobs/:id/retry`

Re-enqueue a failed job.

## Admin — stats

### `GET /v1/admin/stats`

Aggregate counters: tenant count, host count by state, container count by state, capacity utilization.

## Host registration

These endpoints are called by the agent, not by humans. They're documented here for transparency.

### `POST /v1/hosts/register`

Called once by the agent on first connect. Exchanges a bootstrap token for a long-lived host credential.

**Request**

```json
{
  "bootstrap_token": "brt_...",
  "agent_version": "0.1.0",
  "hostname": "agent-host-42",
  "labels": { "region": "eu-1" }
}
```

**Response**

```json
{
  "host_id": "8c1a4b2e-...",
  "host_credential": "hcred_..."
}
```

The bootstrap token is invalidated server-side as part of this call.

## See also

- [gRPC (agent stream)](./grpc.md) — the long-lived stream the agent maintains after registration.
- [Concepts](../concepts/tenants.md) — the resources these endpoints operate on.
