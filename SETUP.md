# Secretary — Setup Guide

## 1. Environment variables

Copy `.env.local` and fill in:

```
ANTHROPIC_API_KEY=        # from console.anthropic.com
GOOGLE_CLIENT_ID=         # from Google Cloud Console
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=          # run: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## 2. Supabase

1. Create a project at supabase.com
2. Go to SQL Editor → run the contents of `supabase-schema.sql`
3. Copy your Project URL and keys from Settings → API

## 3. Google OAuth

1. Go to console.cloud.google.com → New project
2. Enable: Gmail API
3. OAuth consent screen → External → add your email as test user
4. Credentials → Create OAuth 2.0 Client ID (Web application)
5. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
6. Copy Client ID and Secret

## 4. Apple iCloud Calendar (optional)

1. Go to appleid.apple.com → Sign-In and Security → App-Specific Passwords
2. Generate a password for "Secretary"
3. In the app: Settings → enter your Apple ID email + the app-specific password

## 5. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

## 6. Deploy to Vercel

```bash
npx vercel
```

Add all env vars in Vercel dashboard. Update `NEXTAUTH_URL` to your production URL.
Update Google OAuth redirect URI to your production URL.
