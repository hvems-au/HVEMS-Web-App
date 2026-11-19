/** Shared by the server layout and the theme switcher. Plain module (not "use client"), so the server gets the real string. */
export const THEME_KEY = "hvems.theme";

/** Runs in <head> before the page is drawn. Keep it tiny and dependency-free. */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_KEY}");if(c!=="light"&&c!=="dark")c="system";var d=c==="dark"||(c==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
