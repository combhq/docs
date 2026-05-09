# docs

Public documentation site for [combhq](https://github.com/combhq) — a per-tenant container platform that runs across any Linux infrastructure.

The site is built with [VitePress](https://vitepress.dev/) and deploys to GitHub Pages automatically on every push to `main` (see [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)).

## Where the site lives

By default, GitHub Pages serves this site at:

> `https://combhq.github.io/docs/`

That URL works as soon as the org owner enables Pages on this repo (Settings → Pages → Build and deployment → Source: **GitHub Actions**). Until then, the deploy workflow runs successfully but the site has nowhere to publish to.

### Custom domain (e.g. `docs.combhq.dev`)

This requires three things from the **org owner**, in this order:

1. **Own the domain.** Buy `combhq.dev` (or whichever) at any registrar. The docs-writer agent will not register a domain.
2. **Add a `CNAME` record** at the DNS provider:

   ```
   docs.combhq.dev.   CNAME   combhq.github.io.
   ```

3. **Configure GitHub Pages to use it.** In Settings → Pages, set the custom domain to `docs.combhq.dev`. GitHub will provision an HTTPS certificate automatically; tick "Enforce HTTPS" once it's ready.

   Doing this through the web UI also commits a top-level `CNAME` file to the repo. If you'd rather, you can commit `CNAME` containing `docs.combhq.dev` yourself and skip the UI step.

If a custom domain is configured, also update `base` in `.vitepress/config.ts` from `'/docs/'` to `'/'` and re-deploy.

## Local development

```bash
npm install
npm run docs:dev      # http://localhost:5173
npm run docs:build    # outputs to .vitepress/dist
npm run docs:preview  # serve the built site locally
```

Node ≥ 20 is recommended (matches the deploy workflow).

## Syncing the OpenAPI spec

The REST API page is rendered from a snapshot of the control plane's OpenAPI spec, committed at `.vitepress/openapi.yaml`. To refresh it:

```bash
npm run sync:openapi
git diff .vitepress/openapi.yaml
git commit -m "docs(api): sync openapi.yaml from control-plane@<sha>" .vitepress/openapi.yaml
```

The script uses `gh api` to read `combhq/control-plane/internal/restapi/openapi.yaml` (the file the control plane embeds into its binary and serves at `/openapi.yaml`). You'll need `gh auth login` once. Eventually the build can fetch this live; for now a snapshot keeps the docs build hermetic and avoids depending on a private control-plane repo at build time.

## Layout

```
.
├── .vitepress/
│   ├── config.ts            site config
│   ├── openapi.yaml         snapshot of control-plane's OpenAPI spec
│   └── theme/index.ts       extends default theme + registers vitepress-openapi
├── index.md                 landing page
├── what-is-combhq.md
├── architecture.md
├── what-it-is-not.md
├── getting-started/
│   └── operator.md
├── concepts/
│   ├── tenants.md
│   ├── hosts.md
│   ├── containers.md
│   ├── drivers.md
│   └── tunnels.md
├── api/
│   ├── rest.md
│   └── grpc.md
├── roadmap.md
├── brainstorm.md            original pre-implementation design doc (kept verbatim)
├── package.json
└── .github/workflows/deploy.yml
```

## Contributing

The site content is sourced from `brainstorm.md`, which is the canonical design doc for combhq. When the design changes, update `brainstorm.md` first and then propagate the change to whichever user-facing pages are affected.

Conventional commits, please: `docs(...): ...`.
