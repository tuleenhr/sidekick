# Sidekick: a personal AI chief of staff

A web app that runs my life admin. It reads my inbox, tracks deadlines and open loops, and briefs me on what actually matters today. It works through one chat interface backed by Llama 3.3 on Groq, with a deliberately minimal main screen.

The design rule: **no feature gets in unless I'd use it every day.**

## What it does

- **Email triage:** reads Gmail and sorts what needs a reply, what can wait and what to ignore, and drafts responses
- **Daily brief:** pulls calendar (Google and iCloud via CalDAV), deadlines and open loops into one morning summary
- **Deadlines and "waiting on":** tracks things I owe and things other people owe me
- **Chat as the brain:** a brain-dump inbox, "what now?" and "should I bother?" prompts, with long-term memory of my context
- **Life tools:** home tasks and resets, a meal assistant, trip packing, and prayer times

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres) · NextAuth with Google OAuth · Gmail API · CalDAV (tsdav) · Groq (Llama 3.3, through an adapter that keeps the Anthropic SDK interface) · Tailwind CSS 4 · Vercel

24 API routes back the app. The Supabase schema covers open loops, deadlines, email triage, briefings, chat history and user context.

## Running it locally

See [SETUP.md](SETUP.md) for the full Google Cloud and Supabase setup.

```bash
npm install
cp .env.example .env.local   # Anthropic, Google OAuth, Supabase keys
npm run dev
```

## Status

Personal project I use daily.
