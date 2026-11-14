# Calendar Wallpaper — update channel

Upload the CONTENTS of this folder to the root of the public GitHub repo
`maheshjoys-Pega/calendar-wallpaper` (branch `main`). The wallpaper loads its
CSS/JS from `https://cdn.jsdelivr.net/gh/maheshjoys-Pega/calendar-wallpaper@main/`
at runtime; the bundled copies inside the Lively package are the offline
fallback, so a missing or broken host never blanks the wallpaper.

Publish an update = edit files here, bump `version` in `version.js`, commit.
(jsDelivr may take a little while to serve a changed branch file; the
wallpaper also cache-busts the version.js request daily.)
