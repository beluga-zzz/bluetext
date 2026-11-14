# B2Blue

A branded iMessage inbox for client lines. Each workspace is one client: its own BlueBubbles server (one Mac + iPhone number) and its own team. Lead tags and contact names are stored in Cloudflare D1.

## How it works

- `public/` is the UI, served by Workers Assets.
- `src/index.js` is the Worker. It handles `/api/*`, checks the app password, and talks to each workspace's BlueBubbles server. BlueBubbles passwords never reach the browser.
- Tables are created automatically on the first request.

## Accounts

Everyone signs in with their own email and password. There's no signup page: an admin adds people under Admin → Users, which shows a one-time temporary password to send them. They pick their own password the first time they sign in.

- Admins see every workspace and can manage users and workspaces. Members only see the workspaces ticked for them.
- Reset password gives the person a new temporary password and signs them out everywhere. Turn off signs them out and blocks sign-in.
- 5 wrong passwords in a row lock an account for 15 minutes.
- Passwords are hashed with PBKDF2-SHA256 (100,000 rounds, the most Workers allows) and a per-user salt. Code: `src/auth.js`.

The very first admin is created on the setup screen, which only appears while there are no users. It asks for the old shared app password (`blue33!`, or the `APP_PASSWORD` secret if one is set).

## Local development

Create `.dev.vars` (git-ignored):

```
DEV_EMAIL=you@example.com
```

Then run `npm install` and `npm run dev`. Add `DEV_SKIP_LOGIN=1` as well to skip sign-in (localhost only).

## Notes

- Sending uses BlueBubbles' AppleScript method, so the Private API is not required.
- Contacts tagged "Do Not Text" cannot be messaged from the UI.
- New messages appear by polling: chats every 5 seconds, the open thread every 3 seconds.
