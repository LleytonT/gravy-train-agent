# Telegram messaging creates the member

Status: accepted. Supersedes ADR-0004.

Gravy Scout is a Telegram contact, not a website you chat with. A first private message creates or resolves the **member** from the Telegram user ID and establishes **channel identity**. The Login Widget is not how a member comes into existence, and talking never waits on a website sign-in.

Rejected: keep the Widget as the identity gate (ADR-0004) — that made Telegram a lock screen for a web agent. Rejected: website-first `t.me` link without the Widget — a stranger DM still could not talk.

A later dashboard, if built, locks with Telegram Login. Clerk, if it remains, is dashboard-only. This slice does not build the dashboard.
