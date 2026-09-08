# Dump

One dump box. Items auto-sort into Work, Personal, Ideas, or Inbox. Drag a row onto another to nest it. Data lives in Notion.

## Notion setup

1. Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations). Copy the token.
2. Create a **full-page database** with these properties (names must match):
   - **Name** — title
   - **Section** — select options `Work`, `Personal`, `Ideas`, `Inbox`
   - **Done** — checkbox
   - **Order** — number
   - **Parent** — text (leave empty; the app fills it when you nest)
3. Open the database → **•••** → **Connect to** → pick the integration.
4. Copy the database id from the URL: `notion.so/YourName/`**`32hexchars`**`?v=...`

```sh
cp .env.example .env
```

Put the token and database id in `.env`.

## Run locally

```sh
npm install
npm run dev
```

Needs `.env` with `NOTION_TOKEN` and `NOTION_DATABASE_ID`. Open the URL Vite prints.

## Deploy

Push to GitHub, then import the repo in Vercel. Set the same two env vars in the Vercel project.
