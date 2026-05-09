# gRPC — Agent stream

The control plane exposes a gRPC server (default port 8443) that accepts a single bidirectional stream per [host](../concepts/hosts.md). The on-host agent dials in after registering ([`POST /v1/hosts/register`](./rest.md)) and keeps the stream open indefinitely.

::: info Source of truth
The canonical schema lives in [`combhq/proto`](https://github.com/combhq/proto). The summary below describes v1; consult the `.proto` files for exact field types and tags.
:::

## Service

```proto
service AgentService {
  rpc Connect(stream AgentMessage) returns (stream ServerMessage);
}
```

A single long-lived stream multiplexes everything. There is no separate "command" RPC — the server pushes commands down the same stream the agent is heartbeating up.

## Authentication

The agent presents its `host_credential` as a gRPC metadata header on connect (e.g. `authorization: bearer hcred_...`). The credential is issued once per host during registration and is opaque to the agent. Re-registration is required if the credential is revoked.

## Keepalive

- **30s** server keepalive pings.
- **10s** ping timeout.

This catches dead TCP connections in seconds rather than minutes — important for fast-failover behavior on the control plane side.

## Messages — agent → server (`AgentMessage`)

| Message | Purpose |
|---|---|
| `Heartbeat` | Sent every ~30s. Reports host load, container counts, and any state changes since the last heartbeat. Updates `hosts.last_heartbeat_at`. |
| `ContainerStateChanged` | Pushed asynchronously when a container transitions (e.g. `creating → ready`, `ready → failed`). |
| `ContainerInventory` | Sent on (re)connect. Full list of containers the agent currently sees via `docker ps`. The control plane reconciles this against the database. |

## Messages — server → agent (`ServerMessage`)

| Message | Purpose |
|---|---|
| `RunContainer` | Start a container with the given image, env, limits, and tunnel token. |
| `StopContainer` | Stop and remove a container by ID. |

The agent acknowledges commands by pushing the resulting `ContainerStateChanged`.

## Disconnect handling

### Agent side

- **Containers keep running.** The agent never kills containers because the control plane is unreachable. This is the most important rule in the system.
- **Reconnect with exponential backoff + jitter** (1s, 2s, 4s, …, capped at 60s, ±20% jitter). Jitter prevents a thundering herd on control-plane restart.
- **Reconnect forever.** No "give up" state.
- **Buffer state changes locally** (bounded, ~100 events). Replayed on reconnect.

### Control plane side

Three-layer detection:

1. **gRPC keepalive** — sub-second detection of fast disconnects.
2. **In-memory stream registry** — server flips `connected=false` when the stream closes.
3. **DB heartbeat watcher** — periodic check for stale `last_heartbeat_at`, as a safety net.

Followed by the host state machine in [Concepts → Hosts](../concepts/hosts.md): `ready → unhealthy → unreachable → terminated`. Each transition is buffered to avoid panicking on transient network problems.

## Reconnect handshake

On reconnect, the agent sends a `ContainerInventory`. The server compares to the database:

| Container is… | Action |
|---|---|
| In DB and on host | No action. |
| In DB, missing on host | Mark for re-provisioning. |
| On host, missing from DB | Orphan — investigate or remove. |

## See also

- [REST API → host registration](./rest.md#host-registration) — how the agent obtains the credential it uses to open this stream.
- [Concepts → Containers](../concepts/containers.md) — the lifecycle the messages on this stream drive.
- [Concepts → Hosts](../concepts/hosts.md) — the host state machine.
