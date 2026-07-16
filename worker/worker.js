/**
 * Cloudflare Worker: verifies a Turnstile token, validates the submitted
 * contact, then writes a waitlist lead to Firestore via the Admin REST API.
 *
 * Deploy: `wrangler deploy` from this directory (see worker/README.md).
 * Required secrets (wrangler secret put <NAME>):
 *   TURNSTILE_SECRET_KEY   — from the Cloudflare Turnstile dashboard
 *   FIREBASE_PROJECT_ID    — Firebase project id
 *   FIREBASE_CLIENT_EMAIL  — service account client_email
 *   FIREBASE_PRIVATE_KEY   — service account private_key (with \n escaped)
 * Required var (wrangler.toml [vars] or dashboard):
 *   ALLOWED_ORIGIN         — e.g. https://donado.me
 */

const TG_RE = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_LANGS = ['ru', 'kz', 'en'];

function validateContact(raw) {
  const v = (raw || '').trim();
  if (!v || v.length > 200) return false;

  if (v.includes('@') && !v.startsWith('@')) {
    return EMAIL_RE.test(v);
  }
  const handle = v.startsWith('@') ? v.slice(1) : v;
  if (handle.endsWith('_') || handle.includes('__')) return false;
  return TG_RE.test(handle);
}

function corsHeaders(origin, allowedOrigin) {
  const allow = origin === allowedOrigin ? origin : allowedOrigin;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

async function verifyTurnstile(token, secret, remoteip) {
  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteip) body.set('remoteip', remoteip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const data = await res.json();
  return !!data.success;
}

// --- Minimal Google OAuth2 (service account JWT bearer flow) using Web Crypto ---

function base64url(input) {
  let bytes;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }
  let str = '';
  bytes.forEach((b) => { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

async function getAccessToken(env) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const encHeader = base64url(JSON.stringify(header));
  const encClaims = base64url(JSON.stringify(claims));
  const signingInput = `${encHeader}.${encClaims}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64url(signature)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString()
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('failed to obtain access token');
  return tokenData.access_token;
}

async function writeToFirestore(env, accessToken, contact, lang) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/waitlist`;
  const body = {
    fields: {
      contact: { stringValue: contact },
      lang: { stringValue: lang },
      createdAt: { timestampValue: new Date().toISOString() }
    }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore write failed: ${res.status} ${text}`);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers });
    }

    if (origin !== env.ALLOWED_ORIGIN) {
      return new Response(JSON.stringify({ error: 'forbidden origin' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'invalid json' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const { contact, lang, turnstileToken } = payload || {};

    if (!turnstileToken) {
      return new Response(JSON.stringify({ error: 'missing turnstile token' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (!validateContact(contact)) {
      return new Response(JSON.stringify({ error: 'invalid contact' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (!ALLOWED_LANGS.includes(lang)) {
      return new Response(JSON.stringify({ error: 'invalid lang' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const remoteip = request.headers.get('CF-Connecting-IP');
    const turnstileOk = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, remoteip);
    if (!turnstileOk) {
      return new Response(JSON.stringify({ error: 'turnstile verification failed' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    try {
      const accessToken = await getAccessToken(env);
      await writeToFirestore(env, accessToken, contact.trim(), lang);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'storage failure' }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
};
