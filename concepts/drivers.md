# Drivers

A **driver** is the abstraction that lets the control plane provision a [host](./hosts.md) on a given infrastructure provider. Drivers are pluggable; combhq is not tied to any one cloud.

## Interface

```go
type Driver interface {
    Name() string
    Provision(ctx context.Context, spec HostSpec) (HostInfo, error)
    Terminate(ctx context.Context, providerID string) error
    Capabilities() Capabilities
}
```

- `Provision` creates a VM (or its equivalent) and returns enough information to track it: the provider's instance ID, region, etc.
- `Terminate` is idempotent — calling it for an instance that no longer exists is not an error.
- `Capabilities` advertises what the driver supports (regions, instance tiers, GPU, custom images).

The control plane never opens an inbound connection to the host. Once `Provision` returns, the agent on the new VM dials home — see [hosts](./hosts.md).

## Available drivers

| Driver | Purpose |
|---|---|
| `manual` | No-op. Hosts register themselves via the install script. Always supported. The path of least resistance for getting started; see the [operator quickstart](../getting-started/operator.md). |
| `hetzner` | Cheapest cloud option for early scaling. (Roadmap.) |
| `aws` | Compliance-focused / corporate use. (Roadmap.) |
| `gcp`, `digitalocean`, `vultr` | Added as needed. (Roadmap.) |

See the [roadmap](../roadmap.md) for the order things are landing in.

## How a cloud driver flow works

1. The operator (or the capacity planner) requests a new host with a provider preference.
2. A `provision_host` job is enqueued.
3. The job worker calls `driver.Provision(spec)`.
4. The cloud VM boots; cloud-init installs the agent with a bootstrap token issued by the same job.
5. The agent dials the control plane, exchanges the bootstrap token for a host credential, and registers.
6. The host appears in the database in `ready`.

From step 5 onward, an auto-provisioned host is indistinguishable from one added manually.

## Writing a driver

Drivers live in [`combhq/drivers`](https://github.com/combhq/drivers). Implementing one means:

1. Implement the four-method `Driver` interface.
2. Provide a cloud-init template (or equivalent) that installs the agent.
3. Register the driver in the control plane's driver registry.
4. Add tests using the provider's test/sandbox environment where possible.

## Reconciliation

The [reconciler](../brainstorm.md) (a periodic job) calls each registered driver to list what it knows about. The control plane then compares against the database to detect:

- **Orphans** — instances in the cloud that the database has no record of. Flagged; not auto-deleted (operator decides).
- **Missing** — instances in the database that no longer exist in the cloud. Marked `terminated`, affected tenants re-provisioned.

This catches drift introduced by failed teardowns, manual cloud-console operations, and provider-side terminations.

## See also

- [Hosts](./hosts.md) — what a driver is provisioning.
- [Roadmap](../roadmap.md) — driver ordering.
