# Blue Text

A branded iMessage inbox for client lines. Each workspace is one client: its own BlueBubbles server (one Mac + iPhone number) and its own team. Lead tags and contact names are stored in Cloudflare D1.

## How it works

- `public/` is the UI, served by Workers Assets.
- `src/index.js` is the Worker. It handles `/api/*`, checks the Cloudflare Access login, and talks to each workspace's BlueBubbles server. BlueBubbles passwords never reach the browser.
- Tables are created automatically on the first request.

## Settings (Worker > Settings > Variables and Secrets)

| Name | Type | Value |
|---|---|---|
| `ADMIN_EMAILS` | Secret | Comma-separated admin emails |
| `ACCESS_TEAM_DOMAIN` | Secret | e.g. `yourteam.cloudflareaccess.com` |
| `ACCESS_AUD` | Secret | The Access application's Audience (AUD) tag |

The API refuses every request until both Access values are set.

## Local development

Create `.dev.vars` (git-ignored):

```
DEV_EMAIL=you@example.com
ADMIN_EMAILS=you@example.com
```

Then run `npm install` and `npm run dev`. `DEV_EMAIL` only works on localhost.

## Notes

- Sending uses BlueBubbles' AppleScript method, so the Private API is not required.
- Contacts tagged "Do Not Text" cannot be messaged from the UI.
- New messages appear by polling: chats every 5 seconds, the open thread every 3 seconds.
