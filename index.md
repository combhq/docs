---
layout: home

hero:
  name: combhq
  text: Per-tenant containers, anywhere.
  tagline: A platform for spawning and managing per-tenant containers across cloud, bare metal, or local machines. Workload-agnostic. Provider-agnostic.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started/operator
    - theme: alt
      text: What is combhq?
      link: /what-is-combhq
    - theme: alt
      text: GitHub
      link: https://github.com/combhq

features:
  - title: One container per tenant
    details: Operators (or end users) request a container; combhq picks a host with capacity, runs it, and exposes it on a stable subdomain via Cloudflare Tunnel.
  - title: Provider-agnostic
    details: A host is any Linux box running the agent. Cloud VMs, bare metal, and laptops are interchangeable. Pluggable drivers add cloud auto-provisioning.
  - title: Workload-agnostic
    details: The container image is config. LLM proxies, per-user databases, sandboxed compute, dev environments, bot runners — nothing in the design is workload-specific.
  - title: Slow reactions over fast panic
    details: Containers keep running if the control plane disconnects. The reconciler resolves drift. A 60-second blip never triggers re-provisioning.
---
