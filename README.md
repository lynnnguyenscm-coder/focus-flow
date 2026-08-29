# Focus Flow

A simple Pomodoro-style focus timer with task tracking, daily goals, and streaks — built with plain HTML, CSS, and JavaScript (no build step, no dependencies).

## Features

- Work / short break / long break timer modes with a circular progress ring
- Task list with per-task pomodoro counts
- Daily goal tracker with a progress bar
- Day streak tracking based on completed pomodoros
- Celebration animation (confetti + chime) when a session or daily goal is completed
- All data is saved locally in the browser via `localStorage` — nothing is sent anywhere

## Running locally

No build tools or server required. Just open `index.html` in a browser:

```bash
open index.html   # macOS
start index.html  # Windows
```

Or serve the folder with any static file server, e.g.:

```bash
npx serve .
```

## Project structure

- `index.html` — page structure and layout
- `style.css` — styling and theme
- `app.js` — timer logic, task management, and state persistence
