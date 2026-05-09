# Hosts

A **host** is any Linux box with Docker and the combhq agent installed. Hosts run tenant [containers](./containers.md) and one agent process; they are the data plane.

Cloud VMs, bare-metal servers, and developer laptops are interchangeable from the control plane's point of view.

## How a host enters the system

There are two paths, both of which converge on the same state once the agent has connected.

### Manual / BYOH (Bring Your Own Host)

An operator runs an install command on a Linux box they already own:

```bash
curl https://control.example.com/install.sh | TOKEN=brt_... sh
```

The script installs Docker (if needed) and the agent, then the agent uses the bootstrap token to register and is added to the database. See the [operator quickstart](../getting-started/operator.md#step-2-add-your-first-host) for the end-to-end flow.

### Auto-provisioned via a driver

A [driver](./drivers.md) (e.g. `hetzner`, `aws`) creates a cloud VM. Cloud-init installs the agent with a bootstrap token that was generated when the provisioning job started. The agent connects, and from there the path is identical to manual.

## Bootstrap tokens

- One-time-use.
- Short TTL (~15 minutes).
- Exchanged on first connect for a long-lived host credential.
- Cleared from the `hosts` row once the exchange succeeds.

Leaked install commands stop working quickly, and a host credential cannot be replayed by anyone else.

## State machine

| State | Meaning | Behavior |
|---|---|---|
| `launching` | Driver call dispatched, agent not yet connected. | No work assigned. |
| `ready` | Connected, heartbeat fresh, capacity available. | Eligible for new container assignments. |
| `unhealthy` | No heartbeat in 3× the heartbeat interval. | Stop assigning new containers. Existing containers are left alone. Alert. |
| `unreachable` | No heartbeat in 10× the interval. | Investigate. May be paged. |
| `draining` | Operator-initiated. | No new work; existing containers migrated off. |
| `terminated` | Confirmed dead (operator action or driver). | Affected tenants re-provisioned elsewhere. |

::: tip Disconnected ≠ dead
A 60-second blip should never trigger re-provisioning. The `unhealthy` state is an intermediate buffer specifically to absorb transient network problems. See [the design notes](../brainstorm.md) §9 for the full rationale.
:::

## Capacity & bin-packing

Each host has a `capacity` (max containers) and a `current_load` counter. The container-provisioning job picks a host with this query:

```sql
SELECT id FROM hosts
WHERE status = 'ready' AND current_load < capacity
ORDER BY current_load DESC
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

Sorting by `current_load DESC` packs tenants onto the fullest available host first, which keeps idle hosts genuinely idle (and therefore safe to retire).

If no host has capacity, the job enqueues a `provision_host` job and reschedules itself in 60 seconds.

## Labels

`hosts.labels` is a JSON map used for placement constraints. Examples:

```json
{ "region": "eu", "tier": "premium", "gpu": "true" }
```

The capacity planner can be told to honor a tenant's region preference, restrict a tenant to GPU hosts, and so on. v1 supports the field; richer placement DSLs are deferred.

## See also

- [Drivers](./drivers.md) — how hosts get auto-provisioned.
- [Containers](./containers.md) — what runs on a host.
- [REST API → admin/hosts](../api/rest.md#admin-hosts) — list, drain, delete.
