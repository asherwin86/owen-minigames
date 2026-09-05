// Compact UI: a hub-wide density toggle — smaller game tiles (more fit per
// screen, less scrolling through 89 games), a smaller dock, and a slimmer
// toolbar around whichever game is open (more of the screen goes to the
// actual game canvas). Same owning-module shape as js/hub-backdrop.js and
// js/fps-meter.js: this module owns the localStorage key and the on/off
// state; settings-panel.js just wires a button to isOn()/setEnabled().
(function () {
  const KEY = "mimiCompactUi";

  function isOn() {
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }

  function apply(on) {
    document.documentElement.classList.toggle("compact-ui", on);
  }

  function setEnabled(on) {
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
    apply(on);
  }

  apply(isOn());

  window.MimiUiDensity = { isOn, setEnabled };
})();
