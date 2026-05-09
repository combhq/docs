# What it is not

combhq is small on purpose. The list below states what is explicitly out of scope so you can decide quickly whether the platform fits your problem.

## High-level non-goals

- **Not Kubernetes.** No pods, no DaemonSets, no operators. The model is one container per tenant, and hosts are bin-packed.
- **Not a function runtime.** Containers are long-lived (days+), not request-scoped.
- **Not a PaaS for end users.** Operators run combhq; end users get a subdomain.
- **Not multi-region (yet).** Single-region per deployment for v1.

## Things explicitly **not** in scope for v1

- Per-tenant outbound IP isolation (the `proxy_pool` table is sketched in the design but not built).
- SSH / shell access to tenant containers.
- User-uploaded images (only operator-curated images for now).
- Multi-region deployment.
- Stateful workloads with cross-host migration. Containers are assumed stateless or to use host-local volumes only.

## Paths we explicitly chose **not** to take

| Path | Why not |
|---|---|
| Kubernetes / ECS / Nomad | Overkill at this scale; one workload per container, ≤100s of containers initially. |
| Per-tenant VM (instead of container) | Too expensive; bin-packing on shared hosts is the win. |
| Cloud-native lock-in (SSM, ENIs, EIPs, etc.) | Locks us in; replaced by the agent-pull model and pluggable drivers. |
| SSH-based remote control | Key management is painful; agent-pull is cleaner. |
| One-shot polling agents | High latency, wastes bandwidth, hammers the database. |
| Per-container dedicated public IPs (ENI/EIP) | Complex setup, provider quotas; a proxy pool is the better model. |
| Real residential proxy from day one | External dependency; layer in via `proxy_pool` when needed. |
| LLM-specific design choices | combhq is a workload-agnostic platform; the LLM proxy is just one container image. |

If something on this page is a hard requirement for you, see the [roadmap](./roadmap.md) — some of these are deferred, not refused.
