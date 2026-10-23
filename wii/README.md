# Owen's Minigames — Nintendo Wii edition

Twelve short Wii Remote games in one native Wii homebrew app (`boot.dol`), made from the 51 Mimi Games project: the
rules of Balloon Pop, Whack-a-Mole, Fruit Catcher, Memory Match, Bubble Pop and Target Practice come from the
JavaScript games in `../js/games/`, rewritten in C for the Wii; Dodge It!, Fishing Frenzy, Racing Challenge,
Treasure Hunt, Outlaw Shootout (a gun game) and Fist Fury (a fighting game) are new. Everything is drawn with shapes and an embedded font and every sound is synthesised in code, so
the app is one self-contained file plus a tiny `meta.xml` and `icon.png`. No internet, no save files, no extra data.

> **Status, honestly:** it builds cleanly and its game logic passes an automated test suite on a PC. The original ten games
> were run on a real Wii by the owner (2026-10-23) and work. **Outlaw Shootout and Fist Fury, added afterwards, have only
> been tested on a PC**, and nothing has been run in the Dolphin emulator. See
> [Known limitations](#known-limitations-and-untested-features).

## The games

| # | Game | Controls | How it works |
|---|---|---|---|
| 1 | **Balloon Pop** | point + **A** | 50 s. Pop balloons (+10, growing combo bonus); bombs cost 15. |
| 2 | **Target Practice** | point + **A** | 45 s, 3 hearts. Bullseye 100 / ring 60 / outer 30, plus up to 40 for speed. A target that runs out costs a heart. |
| 3 | **Whack-a-Mole** | point + **A** | 40 s, 3×3 holes. Golden moles ×3, grey bomb moles −15. Faster as you go. |
| 4 | **Fruit Catcher** | point, or **+Control Pad** | 3 hearts. Catch fruit, golden stars worth 50; a missed fruit or a bomb costs a heart. |
| 5 | **Memory Match** | point + **A** | 75 s, 8 pairs. +100 per pair, −5 per miss, bonus for time left. |
| 6 | **Dodge It!** | point, or **+Control Pad**; **A** dash | 3 hearts. Rocks and laser beams; stars +25; dashing makes you immune. |
| 7 | **Fishing Frenzy** | point to move the boat; **A** (or swing) drops the hook; hold **A** to reel | 60 s. Small 10, medium 30, big 60, golden 120, old boots −15. |
| 8 | **Bubble Pop** | point to aim, **A** fires | Match 3+ colours; unsupported bubbles fall (+20 each); a new row drops every 6 shots. |
| 9 | **Racing Challenge** | **A**/**2** gas, **B**/**1** brake; steer with the pad, tilt, or pointing | 40 s road race, pseudo-3D. Coins +20, checkpoints +8 s, crashes cost time. |
| 10 | **Treasure Hunt** | point + **A** | 50 s. Five treasures under 24 bushes; the glow goes blue→red as you get closer. Each dig costs 1.5 s. |
| 11 | **Outlaw Shootout** | point, **B** or **A** fires, **1** / swing reloads | 60 s, 3 hearts. Bandits pop up in windows and behind barrels and shoot back if you're slow (headshots 150+); townsfolk in white hats must not be shot. Six bullets. |
| 12 | **Fist Fury** | **+Control Pad** move, **Up**/**2** jump, **A** punch, **B** kick, hold **1** block | 120 s. A fighting game against five computer fighters, each tougher; you recover 25 hp after each win. Combos score more. |

Menus: point and press **A** (or use the +Control Pad). The game menu shows a 1–3 star rating per game and the highlighted game's tip; each
game's instruction screen shows a Wii Remote picture with the buttons it uses lit up; **Options** switches music, sound effects and rumble
(not saved). Everywhere: **HOME** or **+** pauses (Resume / Restart / Menu), **B** goes back, and the Wii Remote disconnecting freezes
the game until it reconnects. Without the sensor bar, the **+Control Pad** moves an on-screen cursor instead.

## What you need to build it (WSL / Linux)

The build uses **devkitPPC + libogc**. Two ways to get them:

**A. The official way (needs `sudo`).** Follow <https://devkitpro.org/wiki/Getting_Started>, then:
`sudo dkp-pacman -S wii-dev` and `export DEVKITPRO=/opt/devkitpro DEVKITPPC=/opt/devkitpro/devkitPPC`.

**B. Without root** (this is how it was built here). The devkitPro package server rejects scripted downloads, so the
same packages are taken from a public mirror and unpacked into your home folder:

```bash
# tools: zstd (to unpack the packages)
mkdir -p ~/.local/bin ~/devkitpro-dl ~/devkitpro-root && cd ~/devkitpro-dl
apt-get download zstd && dpkg-deb -x zstd_*.deb zdeb && cp zdeb/usr/bin/zstd ~/.local/bin/ && ln -sf zstd ~/.local/bin/unzstd
M=https://wii.leseratte10.de/devkitPro
curl -LO "$M/devkitPPC/r47%20%282025-05-25%29/devkitPPC-r47.1-1-linux_x86_64.pkg.tar.zst"
curl -LO "$M/libogc/libogc_2.11.0%20%282025-05-25%29/libogc-2.11.0-1-any.pkg.tar.zst"
curl -LO "$M/devkitPPC/devkitppc-rules/devkitppc-rules-1.2.1-1-any.pkg.tar.zst"
curl -LO "$M/other-stuff/gamecube-tools/gamecube-tools-1.0.7-1-linux_x86_64.pkg.tar.zst"
for f in *.pkg.tar.zst; do tar --use-compress-program=unzstd -xf "$f" -C ~/devkitpro-root; done
```

**Versions that matter:** devkitPPC **r47.1 (GCC 15.1.0)** and libogc **2.11.0**. Newer devkitPPC releases (r48–r51) ship
compilers that need glibc 2.35 and will not start on Ubuntu 20.04 (glibc 2.31): `GLIBC_2.35 not found`. If you are on
Ubuntu 22.04 or newer you can use the newest release instead.

`scripts/devkitpro-env.sh` sets `DEVKITPRO`, `DEVKITPPC` and `PATH` for either layout; `build.sh` sources it for you.

## Build

```bash
./wii/build.sh          # from the repo root, or ./build.sh inside wii/
```

It checks the toolchain first and says exactly what is missing, then builds and packages. Output:

| What | Where |
|---|---|
| The program | `wii/dist/apps/owen-minigames/boot.dol` (also `wii/out/boot.dol` and `boot.elf`) |
| Homebrew Channel metadata | `wii/dist/apps/owen-minigames/meta.xml`, `icon.png` |
| Object files | `wii/build/` |

`make clean` removes `build/`, `out/` and `dist/`. Building never touches the USB drive.

## Tests

```bash
make -C wii/tests test           # fast: the game code with stub graphics, under AddressSanitizer + UBSan
make -C wii/tests captures FFMPEG=/path/to/ffmpeg   # the same tests again, recording mp4 video and PNG screenshots
make -C wii/tests showcase FFMPEG=/path/to/ffmpeg   # a guided tour of every screen
```

Without a sensor bar (the pointer then never works) the **+Control Pad** moves a cursor that speeds up the longer it is held; the
title and instruction screens say so.

The tests compile the **real** game code on the PC and drive it with scripted Wii Remote input: menu and tile selection,
instructions → countdown → play → pause → restart → results → menu for all twelve games; each game's scoring, timer, lives
and win/lose rules; a random "monkey" player for every game; the Wii Remote disconnect freeze; 16:9 drawing. Every test
also fails on any NaN passed to a drawing call. The recorded videos use a PC software renderer (`tests/gfx_soft.c`)
fed by those same drawing calls. **They are not output from a Wii or an emulator.**

Note: on this machine the sanitizer needs address randomisation off (the Makefile uses `setarch -R`); without it the
old sanitizer runtime crashes at start-up about one run in three on WSL2's kernel, before any game code runs.

## Checking it in the Dolphin emulator

Dolphin runs the real `boot.dol` and is the only place the GX drawing can be checked without a console. A special
**autopilot** build replaces the Wii Remote with a script (moves the pointer, presses buttons on a timer) so it can run
unattended:

```bash
make -C wii BUILD=build-ap OUTDIR=out-ap EXTRA_CFLAGS=-DAUTOPILOT     # -> wii/out-ap/boot.dol  (never deploy this one)
Dolphin.exe -u <a scratch settings folder> -b -e out-ap/boot.dol       # a separate settings folder leaves your Dolphin setup alone
```

Running it that way found two real bugs the PC tests could not see (the font texture's alpha/intensity nibbles were swapped, so
every letter sat in a black box; and the closing vertex of rounded rectangles was wrong). Dolphin 2609a (D3D11, HLE audio, JIT64)
then ran the title, Options, menu, instruction and Whack-a-Mole screens correctly. Not covered: sound, rumble, real Wii Remote input
and real-hardware speed. Note that Dolphin's *own* default here had Wii Remote 1 set to "Real Wii Remote" (Controllers → Wii
Remote 1 → Source), which shows the in-game "Wii Remote disconnected" box until a physical remote pairs: choose "Emulated Wii
Remote" instead.

## Putting it on the Wii USB drive

The drive must be **FAT32** (or FAT) with an `apps` folder, which is what the Homebrew Channel and USB Loader GX read.

```bash
./wii/scripts/deploy-usb.sh --dry-run    # checks everything, changes nothing
./wii/scripts/deploy-usb.sh              # deploys to F:\apps\owen-minigames\  (--drive G for another letter)
```

The script refuses to run unless the build output is valid and the drive looks like a Wii drive (FAT filesystem, has
`apps\` or `wbfs\`). It creates `apps\owen-minigames\` and copies three files; it **never formats, deletes, or touches
`wbfs\`, USB Loader GX's settings or other apps**; an older copy of this app is moved aside as
`owen-minigames.backup-<time>` (its `boot.dol` renamed to `boot.dol.old` so the Homebrew Channel does not list it), and once the new
copy has been checksum-verified, **older backups are removed so only the newest one is kept** (only folders named exactly
`owen-minigames.backup-YYYYmmdd-HHMMSS` are ever considered). `--test-root <folder>` runs the script against an ordinary folder. If WSL has no `/mnt/f` it goes through
`powershell.exe`; to mount the drive in WSL instead: `sudo mkdir -p /mnt/f && sudo mount -t drvfs F: /mnt/f`.

Expected layout:

```text
F:\apps\owen-minigames\boot.dol
F:\apps\owen-minigames\meta.xml
F:\apps\owen-minigames\icon.png
```

## Launching it

1. **Homebrew Channel (the reliable way).** Start the Homebrew Channel with the USB drive connected and pick
   **Owen's Minigames**. (If the HBC does not list USB apps on your setup, copy the `apps\owen-minigames` folder to an SD
   card instead.)
2. **USB Loader GX.** USB Loader GX has a built-in homebrew launcher that lists the `apps` folder; look for its
   Homebrew option and pick Owen's Minigames. This is untested on your Wii. The app does **not** appear in USB Loader GX's
   *game list* (the `wbfs` folder): that list is only for Wii disc images, and a homebrew `boot.dol` is not one. Renaming
   it to `.wbfs` would not work. Making a real disc image needs Nintendo's own boot code from one of your own game
   discs, which is a separate decision (see below).
3. Press **HOME** on the title screen to quit back to where you came from.

### Why this is very unlikely to harm the Wii

The program only draws (GX video), reads the Wii Remote (WPAD) and plays sound (ASND). It does not touch the Wii's internal
storage (NAND), install a channel, reload an IOS, write to the USB drive or SD card while running (there is no save file; best
scores last until you quit), or use the network. You can check that in the compiled program: `powerpc-eabi-nm -u wii/build/*.o`
lists the calls it makes, and none are file, IOS, ES, ISFS, USB-storage or network functions. Homebrew that stays inside those limits
can crash or freeze (hold the Wii's power button to recover) but is not the kind of thing that bricks a console. That is a
review of the code, not a guarantee, and it has not been run on a console yet.

## Troubleshooting

| Symptom | Try |
|---|---|
| `GLIBC_2.35 not found` when building | Use devkitPPC r47.1 (see above) or a newer Linux. |
| `/mnt/f` missing in WSL | The deploy script works without it. Or: `sudo mount -t drvfs F: /mnt/f`. |
| Owen's Minigames not in the Homebrew Channel | Check `apps\owen-minigames\boot.dol` and `meta.xml` are on the drive; try an SD card; reload the HBC list. |
| Black screen, then back to the loader | Take a photo of any message and report it; try 480i (Wii settings → Screen → EDTV/HDTV off). |
| Pointer jumps around or is missing | Check the sensor bar is on and in Wii settings; the +Control Pad moves a cursor instead. |
| Remote says disconnected | Press A, or 1 and 2 together. |

## Known limitations and untested features

* **Hardware-tested only for the first ten games, and only by playing them.** Not run in Dolphin. The two newest games are
  unverified on a console. Tilt steering (the sign of the roll axis in Racing may need flipping) and frame rate in the
  busier games (Racing, Fist Fury) have not been measured.
* No best-score saving (deliberate, to avoid writing to your USB drive).
* Racing's tilt steering, Fishing's "swing to cast" and the gun game's "swing to reload" depend on accelerometer behaviour I could not test.
* Fist Fury is played with the remote held upright (the +Control Pad moves, A/B attack); it is not set up for sideways play.
* Not in USB Loader GX's game list (see above).
* The font is DejaVu Sans Bold (Bitstream Vera licence), embedded as a 4-bit atlas (`source/font_data.c`, made by
  `tools/make_assets.py`); the icon is generated by the same script.
