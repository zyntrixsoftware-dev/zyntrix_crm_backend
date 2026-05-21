/* ════════════════════════════════════════════════════════════════════
   Zyntrix — shared appearance applier
   Reads the saved Settings → Appearance preferences from localStorage and
   reflects them as attributes on <html> so theme.css can style every page.
   Loaded in <head> (before paint) on all employee pages, and used by the
   Settings page to apply changes live.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  var KEY = "zyntrix_settings";

  function readAppearance() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "{}");
      return (s && typeof s === "object" && s.appearance) ? s.appearance : {};
    } catch (e) {
      return {};
    }
  }

  function resolveTheme(theme) {
    if (theme === "light") return "light";
    if (theme === "dark")  return "dark";
    // "system" (or unset) → follow the OS preference
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
        return "light";
      }
    } catch (e) {}
    return "dark";
  }

  function apply(appearance) {
    appearance = appearance || {};
    var root = document.documentElement;
    root.setAttribute("data-theme",   resolveTheme(appearance.theme || "dark"));
    root.setAttribute("data-density", appearance.density || "default");
    if (appearance.compactSidebar) {
      root.setAttribute("data-compact-sidebar", "true");
    } else {
      root.removeAttribute("data-compact-sidebar");
    }
  }

  function applyFromStorage() {
    apply(readAppearance());
  }

  // Apply right away — this file is included in <head>, so it runs before the
  // body is painted and there is no flash of the wrong theme.
  applyFromStorage();

  // Keep "system" theme in sync if the OS toggles light/dark while open.
  try {
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    var onChange = function () {
      var a = readAppearance();
      if (!a.theme || a.theme === "system") apply(a);
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch (e) {}

  // Expose for the Settings page to call live as the user changes controls.
  window.ZyntrixAppearance = {
    apply: apply,
    applyFromStorage: applyFromStorage,
    readAppearance: readAppearance,
    resolveTheme: resolveTheme
  };
})();
