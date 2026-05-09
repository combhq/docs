# What is combhq?

**A platform for spawning and managing per-tenant containers (and the hosts they run on) across any infrastructure — cloud, bare metal, or local machines.**

The core capability: an operator (or end user, depending on how it's deployed) requests a container with some configuration, and the platform picks a host with capacity, runs the container there, exposes it on a stable subdomain via [Cloudflare Tunnel](./concepts/tunnels.md), and manages its lifecycle.

## Workloads it can run

The platform is workload-agnostic. The container image is config. Examples:

- **LLM proxy / API gateway** — forward requests to OpenAI/Anthropic with per-user keys, rate limits, logging
- **Per-user databases / caches** — Postgres-per-tenant, Redis-per-tenant
- **Sandboxed compute** — code execution, untrusted-input processing
- **Per-customer SaaS instances** — single-tenant deployments of an app
- **Bot / automation runners** — scheduled jobs, scrapers, integrations
- **Dev environments** — give each developer an isolated remote workspace
- **CI / build runners** — ephemeral or long-lived

The original design was driven by the LLM proxy use case, but nothing in the architecture is LLM-specific.

## How the pieces fit

- **[Tenants](./concepts/tenants.md)** are the unit of isolation. One tenant gets one container.
- **[Containers](./concepts/containers.md)** are long-lived (days+), not request-scoped.
- **[Hosts](./concepts/hosts.md)** are any Linux box with Docker and the combhq agent installed.
- **[Drivers](./concepts/drivers.md)** let the control plane auto-provision hosts on a cloud — or you can bring your own.
- **[Tunnels](./concepts/tunnels.md)** expose each tenant container on a stable subdomain, no public IPs required.

Read the [architecture page](./architecture.md) for the three-tier picture, or jump straight into the [operator quickstart](./getting-started/operator.md).

## See also

- [What it is not](./what-it-is-not.md) — explicit non-goals.
- [Roadmap](./roadmap.md) — what's coming after v1.
