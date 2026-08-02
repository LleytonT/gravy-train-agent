# Authentication and member context

Gravy Scout uses Clerk for end-member authentication and an internal identity module for stable `memberId` values.

## Provisioning

Clerk is installed through the Vercel Marketplace resource `gravy-scout-auth` and connected to the project's production, preview, and development environments. Pull keys without printing them:

```bash
pnpm dlx vercel@latest env pull .env.local --yes
```

Required variables:

- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`

## Request flow

1. `proxy.ts` runs `clerkMiddleware` and calls `auth.protect()` on every non-public route.
2. Public routes: `/how-it-works`, `/sign-in`, `/sign-up`, `/eve/v1/health`, `/api/messaging-config`.
3. Protected Next route handlers call `requireAuthenticatedMember()` (`lib/auth/member.ts`), which upserts `members.external_auth_id = Clerk userId`.
4. The web chat client sends a Clerk session JWT as `Authorization: Bearer …` to Eve.
5. `agent/channels/eve.ts` walks auth as `[clerkMemberAuth(), vercelOidc(), localDevMemberAuth()]` — anonymous `none()` is removed.
6. Eve tools read `ctx.session.auth.current.attributes.memberId` through `requireMemberCaller()`. Client-supplied member IDs are ignored.

## Local Eve development

`pnpm dev:tui` / `pnpm dev:no-ui` on loopback still work via `localDevMemberAuth()`, which maps to a durable `external_auth_id = local-dev` member. That path is for explicit local development only; production browser traffic must authenticate with Clerk.

`vercelOidc()` remains available for the Eve CLI and internal Vercel callers. Those principals do not automatically receive a memberId; member-scoped tools fail closed until a Clerk or local-dev member context is present.

## Verification

```bash
pnpm test:auth
pnpm test:database
pnpm typecheck
pnpm build
```

`test:auth` checks that anonymous Eve auth is gone, middleware protects private routes, and identity upserts are isolated by external subject.
