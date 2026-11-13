# To Do List - For the cluttered mind

I built this for a mind that will not sit still.

Too many tasks. Too much clutter. Half of them are real work, half are "maybe later," and some are just ideas that showed up uninvited. They live everywhere and nowhere.

Notion. Notes. Folders inside folders. I tried the serious tools. Either too complicated, or so plain I never opened them again, or so much clicking that opening the app felt like another chore. That last one is the killer. When your head is already loud, extra navigation is not organization. It is more noise.

I love post-it notes. I do. They feel like thinking with your hands. Except my table turned into a yellow landfill, and they are not digital, so I kept taking photos of my own desk like a crime scene. Cute system. Does not travel.

Then I dumped everything into Telegram Saved Messages. Worked for a month. Then I could not find anything. The tasks got buried under more dump. And on the days I go hermit, I do not want to open a messaging app at all. Opening it means the rest of the chats are sitting there, waiting for a reply I do not have in me.

So the problem was never "I need another productivity method." I needed a UI that would get out of the way. No setup ritual. No walls of text. No nested workspace you have to remember how to use. A literal to-do list. Post-it energy, but one place, and digital, so I am not photographing furniture.

And when I actually have the capacity to do real work, I still want the list to live next to everything else I already keep. So it writes to Notion. Dump now. Sort later, if later ever comes.

That is this project.

One box. You dump. It sorts into Work, Personal, Ideas, or Inbox. Drag a row onto another if something needs a nest. Tap a task if you want to give it a day. Today, tomorrow, this week, later gather under quiet headings. Skip it and the list stays flat. When the whole list is too loud, tap the round target next to the dump bar, pick the root tasks you care about, then the same button turns into play to start — nested kids come along, ordered by When. Tap the × to leave. Muted colors. Enter to add. Check it off. That is most of it.

If your head is also full all the time, maybe this is a small thing you can do to quiet it down. Just a little.

---

## 1. Setup

Notion is the setup. The website and the Mac app both read this same database.

1. Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations). Copy the token.
2. Create a **full-page database** with these properties (names must match):
   - **Name** — title
   - **Section** — select. These options are the categories. Start with `Work`, `Personal`, `Ideas`, `Inbox`, or name your own. Add, rename, or remove options in Notion and the app follows them the next time it refreshes.
   - **Done** — checkbox
   - **Order** — number
   - **Parent** — text (leave empty; the app fills it when you nest)
   - **When** — select options `Today`, `Tomorrow`, `This week`, `Later` (leave empty if you do not care)
   - **Focus** — checkbox (optional; the app adds it if missing)
3. Open the database → **•••** → **Connect to** → pick the integration.
4. Copy the database id from the URL: `notion.so/YourName/`**`32hexchars`**`?v=...`

```sh
cp .env.example .env
```

Put the token and database id in `.env`.

---

## 2. Ways to run it

### 2.1. Website

Open [dump-todos.vercel.app](https://dump-todos.vercel.app/). Put in your integration token and database id. Those stay in that browser. A different browser, or clearing the site data, asks again.

To run the same site on this machine:

```sh
npm install
npm run dev
```

---

### 2.2. Mac app

Build a copy you can keep in Applications.

```sh
npm install
npm run dist:mac
```

The app is `To Do.app` inside `release/`. Drag it into Applications.

It is unsigned. The first time, right-click the app and choose Open.

The installed app reads its own `.env`, in:

```sh
~/Library/Application Support/To Do/.env
```

Create the `To Do` folder if it is not there yet. Copy the project `.env` into it.

This copy updates when you run `npm run dist:mac` again and replace the app in Applications. A GitHub push updates the website URL only.

---

### 2.3. Menu bar

Open the Mac app. A list icon stays in the menu bar. Click it and the list drops down. Click the icon again, or click outside the panel, and it closes. Right-click the icon for Open at Login and Quit.

To try the menu bar from this folder before you build the app:

```sh
npm run dev:mac
```

Quit it from the icon before you start it again. That command reads the project `.env`.
