# Donado waitlist Worker

Cloudflare Worker that verifies a Turnstile token and writes waitlist
submissions to Firestore. This is the only piece of "backend" in this
project — everything else in the repo is a static site served by GitHub
Pages.

## 1. Firebase setup

1. Create a project at https://console.firebase.google.com (or reuse an
   existing one).
2. Firestore Database → Create database → production mode, any region.
3. Project settings → Service accounts → Generate new private key. This
   downloads a JSON file — **never commit it**. You'll need three fields
   from it: `project_id`, `client_email`, `private_key`.
4. Firestore → Rules, paste:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /waitlist/{doc} {
         allow read, write: if false; // Admin SDK (used by the Worker) bypasses rules entirely.
       }
     }
   }
   ```

   The Worker writes via the Admin REST API with a service-account OAuth
   token, which bypasses Firestore Security Rules by design — the rules
   above just make sure no client can read/write the collection directly.

## 2. Cloudflare Turnstile setup

1. https://dash.cloudflare.com → Turnstile → Add site.
2. Domain: `donado.me`. Widget mode: **Invisible**.
3. Copy the **Site Key** → paste into `index.html`'s
   `data-sitekey="YOUR_TURNSTILE_SITE_KEY"`.
4. Copy the **Secret Key** → used as a Worker secret below (never put this
   one in the frontend).

## 3. Deploy the Worker

Requires Node.js and the Cloudflare `wrangler` CLI (`npm install -g wrangler`,
or `npx wrangler`).

```bash
cd worker
npx wrangler login          # opens a browser to authorize your Cloudflare account
npx wrangler deploy         # deploys using wrangler.toml in this directory
```

Then set the secrets (each prompts for a value — paste it and press enter):

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put FIREBASE_PROJECT_ID
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
```

For `FIREBASE_PRIVATE_KEY`, paste the `private_key` value from the service
account JSON exactly as it appears (including `-----BEGIN PRIVATE KEY-----`
and the `\n` escape sequences — the Worker code un-escapes them).

If your domain isn't `donado.me` yet, edit `ALLOWED_ORIGIN` in
`wrangler.toml` before deploying (or update it later and redeploy).

## 4. Wire up the frontend

After `wrangler deploy` finishes, it prints a URL like:

```
https://donado-waitlist.YOUR_SUBDOMAIN.workers.dev
```

Put `<that URL>/waitlist` into `script.js`'s `WAITLIST_ENDPOINT` constant.

## 5. Test

Open the site, press the `donado` button 3 times to reveal the waitlist
form, submit a valid email or Telegram handle, and confirm a new document
appears in Firestore's `waitlist` collection (Firebase Console → Firestore
Database → Data).
