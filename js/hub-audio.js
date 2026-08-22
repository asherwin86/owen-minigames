// Hub audio: a small looping background chiptune for the menu screen (never
// plays during an actual game — each game has its own sound), plus a single
// entry point for menu UI sound effects. Off by default — browsers block
// autoplay audio without a user gesture anyway, and unsolicited music on
// page load is exactly the kind of thing worth asking permission for first.
(function () {
  const STORAGE_KEY = "mimiHubMusicOn";
  let musicOn = localStorage.getItem(STORAGE_KEY) === "1";

  let audioCtx = null;
  function getCtx() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playUiSound(name) {
    window.MimiGames?.playSound?.(name);
  }

  // a short, gentle 8-step loop (bass + a sparse melody note here and there)
  // in A minor — deliberately simple and quiet, background music for
  // browsing a menu, not something meant to be listened to on its own
  const BASS = [220, 220, 196, 196, 174.6, 174.6, 196, 196]; // A3 A3 G3 G3 F3 F3 G3 G3
  const MELODY = [null, 440, null, 523.25, null, 392, null, 466.16]; // sparse accents
  const STEP_SECONDS = 0.42;
//the bass is a triangle wave, the melody is a sine wave, and the volume is very low (0.05 for bass, 0.045 for melody) so it doesn't compete with any other audio that might be playing. The loop is 8 steps long, with each step being 0.42 seconds, making the total loop length 3.36 seconds.
  let schedulerId = null;
  let nextStepTime = 0;
  let stepIndex = 0;

  function scheduleStep() {
    const ctx = getCtx();
    while (nextStepTime < ctx.currentTime + 0.15) {
      const t = nextStepTime;
      const bassFreq = BASS[stepIndex % BASS.length];
      playNote(ctx, bassFreq, t, STEP_SECONDS * 0.9, "triangle", 0.05);
      const melFreq = MELODY[stepIndex % MELODY.length];
      if (melFreq) playNote(ctx, melFreq, t, STEP_SECONDS * 0.7, "sine", 0.045);
      stepIndex += 1;
      nextStepTime += STEP_SECONDS;
    }
    schedulerId = setTimeout(scheduleStep, 100);
  }

  function playNote(ctx, freq, startTime, dur, type, volume) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + dur + 0.02);
    } catch (e) {
      /* audio not available */
    }
  }

  function startMusic() {
    if (schedulerId) return;
    const ctx = getCtx();
    nextStepTime = ctx.currentTime + 0.05;
    stepIndex = 0;
    scheduleStep();
  }
  function stopMusic() {
    if (schedulerId) clearTimeout(schedulerId);
    schedulerId = null;
  }

  // paused while an actual game is open (games have their own audio) —
  // resumed automatically when back at the menu, if music is toggled on
  let inGame = false;
  function setInGame(v) {
    inGame = v;
    if (inGame) stopMusic();
    else if (musicOn) startMusic();
  }

  function setMusicOn(v) {
    musicOn = v;
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    if (v && !inGame) startMusic();
    else stopMusic();
  }

  window.MimiHubAudio = {
    playUiSound,
    isMusicOn: () => musicOn,
    setMusicOn,
    toggleMusic: () => { setMusicOn(!musicOn); return musicOn; },
    setInGame,
  };
})();
