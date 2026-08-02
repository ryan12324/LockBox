# Authwell marketing site

The public Authwell site is a static Next.js export intended for `https://authwell.app`.

It reads the public registration capability from `https://api.authwell.app` and changes the
primary action between creating an account and opening an existing vault. Override the API during
development with `NEXT_PUBLIC_API_URL`.

```bash
bun install
cd apps/marketing
bun run dev
bun run build
bun run test
```

`next build` writes the deployable site to `out/`. GitHub Actions publishes that directory to
the `authwell-marketing` Cloudflare Pages project and ensures both `authwell.app` and
`www.authwell.app` are attached. Pages middleware redirects `www` to the apex hostname.

Production destinations:

- Marketing: `https://authwell.app`
- Web vault: `https://vault.authwell.app`
- API: `https://api.authwell.app`
