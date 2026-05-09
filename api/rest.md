# REST API

The reference below is rendered from the control plane's [OpenAPI 3.1 specification](https://github.com/combhq/control-plane/blob/main/internal/restapi/openapi.yaml) — the same document the control plane embeds in its binary and serves at `GET /openapi.yaml`. This site bundles a snapshot of the spec; refresh it with `npm run sync:openapi` (see the [contributing notes](https://github.com/combhq/docs#syncing-the-openapi-spec)).

The control plane exposes JSON REST on its public port (8080 by default). Most write endpoints accept work and immediately return `202 Accepted` with a job ID; the job runs asynchronously through the [river](https://riverqueue.com/) queue. Poll the resource (or, eventually, subscribe to webhooks) to observe state transitions. IDs are UUIDs; timestamps are RFC 3339 / ISO 8601, UTC.

::: info v1 surface today vs intended v1 surface
The shipped surface is intentionally narrow — what's listed below is what the control plane actually routes today. The broader admin surface (delete tenant/container, drain/migrate hosts, jobs admin, stats) lives in the [design notes](../brainstorm.md) and will be filled in against this same OpenAPI spec as it's implemented. Several shipped handler bodies are also still stubs — the contract is fixed, the persistence layer is being filled in.
:::

<OASpec :hide-info="true" :hide-servers="true" />

## See also

- [gRPC (agent stream)](./grpc.md) — the long-lived stream the agent maintains after registration.
- [Concepts](../concepts/tenants.md) — the resources these endpoints operate on.
