# To Do List - For the cluttered mind

I built this for a mind that will not sit still.

Too many tasks. Too much clutter. Half of them are real work, half are "maybe later," and some are just ideas that showed up uninvited. They live everywhere and nowhere.

Notion. Notes. Folders inside folders. I tried the serious tools. Either too complicated, or so plain I never opened them again, or so much clicking that opening the app felt like another chore. That last one is the killer. When your head is already loud, extra navigation is not organization. It is more noise.

I love post-it notes. I do. They feel like thinking with your hands. Except my table turned into a yellow landfill, and they are not digital, so I kept taking photos of my own desk like a crime scene. Cute system. Does not travel.

Then I dumped everything into Telegram Saved Messages. Worked for a month. Then I could not find anything. The tasks got buried under more dump. And on the days I go hermit, I do not want to open a messaging app at all. Opening it means the rest of the chats are sitting there, waiting for a reply I do not have in me.

So the problem was never "I need another productivity method." I needed a UI that would get out of the way. No setup ritual. No walls of text. No nested workspace you have to remember how to use. A literal to-do list. Post-it energy, but one place, and digital, so I am not photographing furniture.

And when I actually have the capacity to do real work, I still want the list to live next to everything else I already keep. So it writes to Notion. Dump now. Sort later, if later ever comes.

That is this project.

One box. You dump. It sorts into Work, Personal, Ideas, or Inbox. Drag a row onto another if something needs a nest. Muted colors. Enter to add. Check it off. That is most of it.

If your head is also full all the time, maybe this is a small thing you can do to quiet it down. Just a little.

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
