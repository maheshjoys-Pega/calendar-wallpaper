// Calendar Wallpaper — update-channel manifest.
// The wallpaper's shell (index.html) loads this file first. It must set
// window.CW_HOSTED with this exact shape, or the wallpaper ignores the host
// and runs its bundled copy. Paths are relative to the host root and mirror
// the package layout (css/, js/, assets/fonts/ for the stylesheet's fonts).
// To publish an update: replace the changed files in this folder's tree,
// bump "version" here, and commit — the wallpaper picks it up on its next
// reload. No reinstall, no re-import.
window.CW_HOSTED = {
  app: "CalendarWallpaper",
  version: "1.3.1",
  css: "css/wallpaper.css",
  js: ["js/feed.js", "js/calendar.js"]
};
