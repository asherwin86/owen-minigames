#!/usr/bin/env bash
# Copies the built Owen's Minigames app onto the Wii USB drive. Building never writes to the drive; only this script does.
#
#   ./scripts/deploy-usb.sh                 deploy to F:\apps\owen-minigames\
#   ./scripts/deploy-usb.sh --dry-run       check everything and say what would be copied, change nothing
#   ./scripts/deploy-usb.sh --drive G       a different Windows drive letter
#
# What it will do:   create <drive>:\apps\owen-minigames\ and put boot.dol, meta.xml and icon.png in it.
# What it will never: format anything, touch wbfs\, usb-loader config, other apps, or anything outside apps\owen-minigames\ and
#                     apps\owen-minigames.backup-<time>\. An older copy of this app is MOVED to a new backup folder first; only
#                     once the new copy is verified are OLDER backups (and only folders named exactly
#                     owen-minigames.backup-YYYYmmdd-HHMMSS) removed, so the newest backup is always kept.
# It checks the drive looks like a Wii USB drive (FAT32/FAT, has apps\ and/or wbfs\) and refuses otherwise.
set -euo pipefail
cd "$(dirname "$0")/.."

DRIVE="F"; DRY=0; TEST_ROOT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --drive) DRIVE="${2:?--drive needs a letter}"; shift ;;
    --test-root) TEST_ROOT="${2:?--test-root needs a folder}"; shift ;;   # for testing the script on an ordinary folder instead of the drive
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
DRIVE="$(echo "$DRIVE" | tr 'a-z' 'A-Z' | cut -c1)"
SRC="$(pwd)/dist/apps/owen-minigames"
APP="owen-minigames"
FILES=(boot.dol meta.xml icon.png)

fail() { echo "ERROR: $*" >&2; exit 1; }
say()  { echo "==> $*"; }

# ---- 1. the build output must exist and look right (never deploy a failed build) ----
for f in "${FILES[@]}"; do [ -s "$SRC/$f" ] || fail "missing build output $SRC/$f. Run ./build.sh first."; done
[ "$(stat -c %s "$SRC/boot.dol")" -gt 100000 ] || fail "boot.dol is suspiciously small; refusing to deploy."
# a DOL header starts with text-section offsets; the first word of a real one is 0x00000100 (the header is 0x100 bytes)
[ "$(xxd -p -l4 "$SRC/boot.dol")" = "00000100" ] || fail "boot.dol does not have a valid DOL header; refusing to deploy."
say "build output OK: $(stat -c %s "$SRC/boot.dol") byte boot.dol"

# ---- 2. find the drive: a WSL mount if there is one, otherwise go through Windows ----
MODE=""; MNT="/mnt/$(echo "$DRIVE" | tr 'A-Z' 'a-z')"
if [ -n "$TEST_ROOT" ]; then MODE="wsl"; ROOT="$TEST_ROOT"; MNT="$TEST_ROOT"
elif [ -d "$MNT/apps" ] || [ -d "$MNT/wbfs" ]; then MODE="wsl"; ROOT="$MNT"
elif command -v powershell.exe >/dev/null 2>&1; then
  MODE="ps"
  PS() { powershell.exe -NoProfile -NonInteractive -Command "$1" 2>&1 | tr -d '\r'; }
  [ "$(PS "if (Test-Path ${DRIVE}:\\) { 'yes' } else { 'no' }")" = "yes" ] || fail "drive ${DRIVE}: is not visible to Windows. Plug the USB drive in. (WSL has no $MNT either; to mount it: sudo mkdir -p $MNT && sudo mount -t drvfs ${DRIVE}: $MNT)"
else fail "drive ${DRIVE}: is not mounted in WSL ($MNT missing) and powershell.exe is not available. Mount it: sudo mkdir -p $MNT && sudo mount -t drvfs ${DRIVE}: $MNT"
fi
say "using drive ${DRIVE}: via $MODE"

# ---- 3. confirm it is the Wii drive and its filesystem is suitable ----
if [ "$MODE" = "ps" ]; then
  FS="$(PS "(Get-Volume -DriveLetter $DRIVE).FileSystem")"; LABEL="$(PS "(Get-Volume -DriveLetter $DRIVE).FileSystemLabel")"
  HAS_APPS="$(PS "if (Test-Path ${DRIVE}:\\apps) {'yes'} else {'no'}")"; HAS_WBFS="$(PS "if (Test-Path ${DRIVE}:\\wbfs) {'yes'} else {'no'}")"
else
  FS="$(df -T "$ROOT" | awk 'NR==2{print $2}')"; LABEL="(n/a)"
  HAS_APPS="$([ -d "$ROOT/apps" ] && echo yes || echo no)"; HAS_WBFS="$([ -d "$ROOT/wbfs" ] && echo yes || echo no)"
fi
echo "    label: $LABEL   filesystem: $FS   apps\\: $HAS_APPS   wbfs\\: $HAS_WBFS"
[ -n "$TEST_ROOT" ] || case "$FS" in FAT32|FAT|vfat|msdos|9p|drvfs) ;; *) fail "unexpected filesystem '$FS'. The Homebrew Channel and USB Loader GX need FAT32 (or FAT) for apps; stopping." ;; esac
[ "$HAS_APPS" = yes ] || [ "$HAS_WBFS" = yes ] || fail "${DRIVE}: has neither an apps\\ nor a wbfs\\ folder, so it does not look like your Wii drive. Stopping without touching it."

# ---- 4. do (or describe) the copy ----
if [ "$MODE" = "wsl" ]; then
  DEST="$ROOT/apps/$APP"
  EXISTS=$([ -d "$DEST" ] && echo yes || echo no)
  say "target: $DEST (existing copy: $EXISTS)"
  [ "$DRY" = 1 ] && { echo "dry run: would copy ${FILES[*]}"; exit 0; }
  mkdir -p "$ROOT/apps"
  if [ "$EXISTS" = yes ]; then
    BK="$DEST.backup-$(date +%Y%m%d-%H%M%S)"
    while [ -e "$BK" ]; do sleep 1; BK="$DEST.backup-$(date +%Y%m%d-%H%M%S)"; done     # never reuse a name: mv would nest the folder inside it
    mv "$DEST" "$BK"
    # the Homebrew Channel lists any apps\ folder that contains a boot.dol, so rename it in the backup to keep it out of the list
    [ -f "$BK/boot.dol" ] && mv "$BK/boot.dol" "$BK/boot.dol.old"
    say "existing copy moved to $BK (its boot.dol is now boot.dol.old, so the Homebrew Channel won't list it; rename it back to restore)"
  fi
  mkdir -p "$DEST"
  for f in "${FILES[@]}"; do cp "$SRC/$f" "$DEST/$f"; done
  sync
  for f in "${FILES[@]}"; do a="$(sha256sum "$SRC/$f" | cut -d' ' -f1)"; b="$(sha256sum "$DEST/$f" | cut -d' ' -f1)"; [ "$a" = "$b" ] || fail "checksum mismatch for $f after copying!"; echo "    verified $f  ${a:0:16}"; done
  # keep only the newest backup: the names sort by time, and only exact backup-folder names are ever considered
  mapfile -t BACKUPS < <(ls -1 "$ROOT/apps" | grep -E "^$APP\.backup-[0-9]{8}-[0-9]{6}$" | sort)
  for ((i = 0; i < ${#BACKUPS[@]} - 1; i++)); do rm -rf -- "$ROOT/apps/${BACKUPS[$i]}"; say "removed older backup ${BACKUPS[$i]}"; done
  [ ${#BACKUPS[@]} -gt 0 ] && say "kept newest backup ${BACKUPS[${#BACKUPS[@]}-1]}"
else
  WSRC="$(wslpath -w "$SRC")"
  EXISTS="$(PS "if (Test-Path ${DRIVE}:\\apps\\$APP) {'yes'} else {'no'}")"
  say "target: ${DRIVE}:\\apps\\$APP (existing copy: $EXISTS)"
  [ "$DRY" = 1 ] && { echo "dry run: would copy ${FILES[*]} from $WSRC"; exit 0; }
  STAMP="$(date +%Y%m%d-%H%M%S)"
  while [ "$(PS "if (Test-Path ${DRIVE}:\\apps\\$APP.backup-$STAMP) {'yes'} else {'no'}")" = yes ]; do sleep 1; STAMP="$(date +%Y%m%d-%H%M%S)"; done   # never reuse a name
  if [ "$EXISTS" = yes ]; then
    PS "Move-Item -LiteralPath '${DRIVE}:\\apps\\$APP' -Destination '${DRIVE}:\\apps\\$APP.backup-$STAMP'" >/dev/null
    # the Homebrew Channel lists any apps\ folder that contains a boot.dol, so rename it in the backup to keep it out of the list
    PS "if (Test-Path '${DRIVE}:\\apps\\$APP.backup-$STAMP\\boot.dol') { Rename-Item -LiteralPath '${DRIVE}:\\apps\\$APP.backup-$STAMP\\boot.dol' -NewName 'boot.dol.old' }" >/dev/null
    say "existing copy moved to ${DRIVE}:\\apps\\$APP.backup-$STAMP (its boot.dol is now boot.dol.old, so the Homebrew Channel won't list it; rename it back to restore)"
  fi
  PS "New-Item -ItemType Directory -Force -Path '${DRIVE}:\\apps\\$APP' | Out-Null" >/dev/null
  for f in "${FILES[@]}"; do PS "Copy-Item -LiteralPath '$WSRC\\$f' -Destination '${DRIVE}:\\apps\\$APP\\$f'" >/dev/null; done
  for f in "${FILES[@]}"; do
    a="$(sha256sum "$SRC/$f" | cut -d' ' -f1)"
    b="$(PS "(Get-FileHash -Algorithm SHA256 -LiteralPath '${DRIVE}:\\apps\\$APP\\$f').Hash" | tr 'A-Z' 'a-z')"
    [ "$a" = "$b" ] || fail "checksum mismatch for $f after copying!"
    echo "    verified $f  ${a:0:16}"
  done
  # keep only the newest backup: the names sort by time, and only exact backup-folder names are ever considered
  mapfile -t BACKUPS < <(PS "Get-ChildItem -Directory ${DRIVE}:\\apps | ForEach-Object { \$_.Name }" | grep -E "^$APP\.backup-[0-9]{8}-[0-9]{6}$" | sort)
  for ((i = 0; i < ${#BACKUPS[@]} - 1; i++)); do PS "Remove-Item -LiteralPath '${DRIVE}:\\apps\\${BACKUPS[$i]}' -Recurse -Force" >/dev/null; say "removed older backup ${BACKUPS[$i]}"; done
  [ ${#BACKUPS[@]} -gt 0 ] && say "kept newest backup ${BACKUPS[${#BACKUPS[@]}-1]}"
fi
say "Deployed. On the Wii: Homebrew Channel -> Owen's Minigames (or USB Loader GX -> Homebrew). See wii/README.md."
