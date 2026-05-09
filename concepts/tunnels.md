# Tunnels

combhq uses [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for ingress. Each tenant container has its own dedicated tunnel — one tenant, one tunnel, one subdomain.

## What this gives you

By offloading ingress to Cloudflare, the platform doesn't need:

- Public IPs on hosts.
- Security groups / firewall rules.
- TLS certificate management.
- DDoS handling.
- Health-check load balancers.

Hosts can sit entirely behind NAT. The `cloudflared` client inside each tenant container dials Cloudflare's edge outbound, and Cloudflare routes incoming requests for `{tenant}.example.com` back through the tunnel.

## Per-tenant, not per-host

Each tenant gets its own tunnel, not one shared tunnel per host. Reasons:

- **Isolation.** A misbehaving tenant's tunnel can be revoked without touching neighbors.
- **Clean teardown.** When a tenant leaves, deleting the tunnel deletes the entire ingress path. There's no shared config to reconfigure.
- **Per-tenant DNS.** `CNAME {handle}.example.com → {tunnel_id}.cfargotunnel.com` is a one-to-one mapping. Easy to reason about.

The cost is some extra Cloudflare API calls at provisioning time. For early scale this is well within free-tier limits. If volume becomes a problem, the per-host alternative is on the [roadmap's open questions](../roadmap.md#open-questions).

## Lifecycle

When a [container](./containers.md) is provisioned:

1. The job worker calls the Cloudflare API to create a tunnel.
2. It creates a CNAME record `{tenant.handle}.example.com → {tunnel_id}.cfargotunnel.com`.
3. It stores the tunnel ID and an encrypted tunnel token on the container row.
4. It dispatches a `RunContainer` command to the agent that includes the tunnel token; `cloudflared` inside the container uses it to dial Cloudflare.

When a container is deprovisioned:

1. `StopContainer` command is sent to the agent.
2. The CNAME record is deleted.
3. The tunnel itself is deleted.
4. The host's `current_load` counter decrements.

## Reconciler

The reconciler periodically lists all tunnels in the configured Cloudflare account and compares against the database. Tunnels that have no corresponding container row, and that are older than the grace period, are deleted. This catches half-finished provisioning and operator mistakes that would otherwise leak resources.

## What you need from Cloudflare

- An account with a zone for the domain you want to expose tenants on (e.g. `apps.example.com`).
- An API token with **Account → Cloudflare Tunnel: Edit** and **Zone → DNS: Edit** scoped to that zone.

Plug those into the control-plane config (or the Terraform module's input variables — see [operator quickstart](../getting-started/operator.md#step-1-deploy-the-control-plane)).

## See also

- [Containers](./containers.md) — what's on the other end of the tunnel.
- [Architecture](../architecture.md) — where the edge tier sits.
