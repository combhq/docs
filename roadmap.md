# Roadmap

This page is forward-looking. It captures what is planned **after v1** and the open design questions still on the table. Anything that was decided is in [Architecture](./architecture.md) or the [concepts pages](./concepts/tenants.md); anything explicitly out of scope is on [What it is not](./what-it-is-not.md).

For shipped milestones, see the project repos.

## After v1

These are the next pieces of work, roughly in order:

- **Reference container images** ([`combhq/images`](https://github.com/combhq/images)) — first-party images for common workloads: LLM proxy, sandboxed compute, …
- **Cloud drivers** — `hetzner` first (cheapest cloud), then `aws` (compliance-driven users). See [Concepts → Drivers](./concepts/drivers.md).
- **Outbound IP isolation** — the `proxy_pool` table and egress assignment, so each tenant's outbound traffic appears from a distinct IP. The data model already has the seam.
- **HA control plane** — running 2+ control-plane instances behind a load balancer. The agent dials whichever instance is reachable; the database is the single source of truth.
- **Cost controls** — auto-stop idle hosts, alerts on instance growth, capacity-utilization budgets.
- **Auto-generated API reference** — once `/openapi.yaml` is exposed by the control plane, this docs site should consume it directly. See the TODO at the top of [REST API](./api/rest.md).

## Open questions

These are decisions deliberately deferred until the platform has more mileage. Listed for transparency — do not assume a particular outcome.

### IP isolation strategy

A proxy pool is the likely design. The open question is the provider choice (datacenter / ISP / residential) and whether to use a managed service or run our own. The `proxy_pool` table will likely live alongside `containers`, with an `assigned_tenant_id` foreign key.

### One tunnel per container vs one tunnel per host

v1 ships per-container tunnels (cleaner isolation, easier teardown). If Cloudflare API call volume becomes a problem at scale, per-host tunnels with subpath routing are the obvious fallback. See [Concepts → Tunnels](./concepts/tunnels.md).

### Container statefulness

v1 assumes stateless containers (or host-local volumes only). If stateful workloads with cross-host migration become important, that's a separate workstream — volume drivers, migration logic, and probably a different host state machine for "draining without losing state."

### Subdomain pattern

v1 uses `{handle}.example.com`, where `handle` is operator-controlled or derived from a tenant ID. Custom per-tenant domains (`acme.com → tenant container`) are a possible extension; they need a separate certificate / SNI strategy.

### Auth model

v1 uses long-lived API keys (simple, stateless). OAuth / OIDC, mTLS for tenant APIs, or per-key scopes are open extensions if usage drives it.

### Multi-tenant containers

v1 is strict 1:1 (one container per tenant). For light workloads this is wasteful, and a "shared container with isolated logical tenants" mode would help, but it changes the placement and accounting model substantially. Deferred.

### Image distribution

Open: Docker Hub vs GHCR vs a private registry. Pinning vs floating tags. There's a reliability tradeoff (pinning) against an operator-ergonomics one (floating).

### Pricing / billing

Out of scope for combhq itself. The platform exposes the metrics needed to bill (host-hours, container-hours, egress); pricing is the operator's choice.

### Geographic routing

v1 is single-region per deployment. Multi-region requires labeling hosts by region and honoring tenant region preferences during placement — both of which the data model already accommodates, but neither of which is wired into the planner yet.

## How this page changes

When something here ships, it should move from "Roadmap" to the appropriate concept or architecture page. When a deferred decision is made, it should turn into a concrete entry under "After v1" until it ships, and then move out the same way.
