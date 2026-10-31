# Blue Text

A branded iMessage inbox for client lines. Each workspace is one client: its own BlueBubbles server (one Mac + iPhone number) and its own team. Lead tags and contact names are stored in Cloudflare D1.

## How it works

- `public/` is the UI, served by Workers Assets.
- `src/index.js` is the Worker. It handles `/api/*`, checks the app password, and talks to each workspace's BlueBubbles server. BlueBubbles passwords never reach the browser.
- Tables are created automatically on the first request.

## Login

The whole app sits behind one password. The default is set in `src/index.js` (`DEFAULT_PASSWORD`). To change it without touching code, add a secret named `APP_PASSWORD` in the Worker's Settings > Variables and Secrets. Changing it signs everyone out.

## Local development

Create `.dev.vars` (git-ignored):

```
DEV_EMAIL=you@example.com
```

Then run `npm install` and `npm run dev`. `DEV_EMAIL` skips the password, and only on localhost.

## Notes

- Sending uses BlueBubbles' AppleScript method, so the Private API is not required.
- Contacts tagged "Do Not Text" cannot be messaged from the UI.
- New messages appear by polling: chats every 5 seconds, the open thread every 3 seconds.
