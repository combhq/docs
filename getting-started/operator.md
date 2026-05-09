# Operator quickstart

This guide walks you from zero to a running tenant container in three steps:

1. [Deploy the control plane](#step-1-deploy-the-control-plane).
2. [Add your first host](#step-2-add-your-first-host).
3. [Provision your first container](#step-3-provision-your-first-container).

Throughout, `https://control.example.com` is a stand-in for whatever address you give the control plane, and `EXAMPLE_DOMAIN` is the domain on which tenant subdomains will be served (e.g. `apps.example.com` → `acme.apps.example.com`).

## Prerequisites

- A Cloudflare account that controls the DNS zone you intend to expose tenants on, plus an API token with **Account → Cloudflare Tunnel: Edit** and **Zone → DNS: Edit** scoped to that zone.
- Somewhere to run the control plane (a small VM is plenty for a first deployment).
- At least one Linux box (any) you can install the agent on. A laptop works.

## Step 1 — Deploy the control plane

Use the [`combhq/terraform`](https://github.com/combhq/terraform) module. The example in `combhq/terraform/examples/minimal/` provisions:

- One VM for the control plane.
- A managed Postgres instance.
- DNS for the control-plane API.

```bash
git clone https://github.com/combhq/terraform.git
cd terraform/examples/minimal
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars     # set domain, region, cloudflare credentials
terraform init
terraform apply
```

When it finishes, the module prints the control-plane URL and the bootstrap admin API key. Save the API key — there is no recovery flow for it in v1.

```bash
export COMBHQ_URL=https://control.example.com
export COMBHQ_ADMIN_KEY=cmb_admin_...
```

Verify the control plane is reachable:

```bash
curl -fsS "$COMBHQ_URL/healthz"
```

::: tip
For development, you can run the control plane locally instead. See `combhq/control-plane/README.md` for the `docker compose up` flow.
:::

## Step 2 — Add your first host

Hosts can be auto-provisioned on a cloud (via a [driver](../concepts/drivers.md)) or added manually. Manual is the path of least resistance for a first host — any Linux box with Docker will do.

Use the CLI to mint an install command:

```bash
combhq install-host
```

It prints a one-liner like:

```bash
curl -fsSL https://control.example.com/install.sh | TOKEN=brt_... sh
```

Paste that on the host you want to add. The script:

1. Installs Docker if it isn't already there.
2. Installs the combhq agent as a systemd service.
3. Exchanges the bootstrap token for a long-lived host credential and connects.

::: warning Bootstrap tokens are one-time-use
The token in the install command is single-use and expires in ~15 minutes. If the install fails, mint a fresh one with `combhq install-host` rather than reusing it.
:::

Confirm the host is connected:

```bash
combhq hosts list
# ID                                    PROVIDER  STATUS  CAPACITY  LOAD
# 8c1a...                               manual    ready   10        0
```

## Step 3 — Provision your first container

Container provisioning happens in two API calls: create the [tenant](../concepts/tenants.md), then create the [container](../concepts/containers.md). The example below uses `curl` so the wire format is visible; the CLI offers `combhq tenants create` and `combhq containers create` as convenience wrappers around the same endpoints.

### Register a tenant

```bash
curl -fsS -X POST "$COMBHQ_URL/v1/tenants" \
  -H "Authorization: Bearer $COMBHQ_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "handle": "acme",
    "email": "ops@acme.example"
  }'
```

```json
{
  "id": "5b2a4c8e-1f7e-4a3b-9c4d-1234567890ab",
  "handle": "acme",
  "email": "ops@acme.example",
  "api_key": "cmb_tenant_acme_...",
  "status": "pending",
  "created_at": "2026-05-08T14:02:11Z"
}
```

The `handle` becomes the subdomain: `acme.apps.example.com`. The tenant `api_key` is shown once — store it.

### Create a container

```bash
curl -fsS -X POST "$COMBHQ_URL/v1/containers" \
  -H "Authorization: Bearer $COMBHQ_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "5b2a4c8e-1f7e-4a3b-9c4d-1234567890ab",
    "image": "ghcr.io/combhq/images/hello:latest",
    "config": {
      "env": {
        "GREETING": "hi from combhq"
      },
      "limits": {
        "memory_mb": 256,
        "cpus": 0.5,
        "pids": 200
      }
    }
  }'
```

```json
{
  "id": "9f8e7d6c-5b4a-3210-fedc-ba9876543210",
  "tenant_id": "5b2a4c8e-1f7e-4a3b-9c4d-1234567890ab",
  "host_id": null,
  "image": "ghcr.io/combhq/images/hello:latest",
  "handle": "acme",
  "status": "pending",
  "created_at": "2026-05-08T14:02:14Z"
}
```

The control plane returns immediately (HTTP 202). Behind the scenes a job picks a host, creates a Cloudflare tunnel, dispatches a `RunContainer` command to the agent, and waits for confirmation.

### Watch it come up

```bash
curl -fsS "$COMBHQ_URL/v1/containers/9f8e7d6c-5b4a-3210-fedc-ba9876543210" \
  -H "Authorization: Bearer $COMBHQ_ADMIN_KEY"
```

`status` will progress `pending → creating → ready` in a few seconds. Once it is `ready`:

```bash
curl -fsS https://acme.apps.example.com/
# hi from combhq
```

That's the loop. The same two endpoints provision every subsequent tenant.

## Next steps

- Read [Concepts → Containers](../concepts/containers.md) for the lifecycle and resource limits in depth.
- Read [Concepts → Hosts](../concepts/hosts.md) for capacity planning, draining, and the host state machine.
- Browse the full [REST API reference](../api/rest.md).
- See [Concepts → Drivers](../concepts/drivers.md) when you're ready to auto-provision hosts on a cloud.
