/**
 * Theme boot script.
 *
 * Runs before the first paint. The renderer cannot read the stored theme from
 * the database at this point - the preload bridge has not answered yet - so it
 * reads the mirror the app keeps in localStorage and puts the class on <html>
 * itself. Without this, every launch paints the light palette and then snaps to
 * dark a few frames later, which reads as a glitch.
 *
 * Deliberately a separate file rather than an inline <script>: it stays render
 * blocking, but it keeps `script-src 'self'` free of 'unsafe-inline', so the
 * strict Content-Security-Policy the app ships is left intact.
 */
(function () {
  "use strict";
  try {
    var stored = window.localStorage.getItem("eyerstock.theme");
    var preference =
      stored === "dark" || stored === "light" || stored === "system" ? stored : "system";

    var resolved =
      preference === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : preference;

    var root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.setAttribute("data-theme", resolved);
  } catch {
    // Storage can be denied in a locked-down profile. The app still renders,
    // it just starts on the default palette until React takes over.
  }
})();