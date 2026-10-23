#!/usr/bin/env bash
# One command to build the Wii app:   ./wii/build.sh        (from anywhere)
# It checks that the toolchain is there first and says exactly what is missing if not. It only writes inside wii/.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=scripts/devkitpro-env.sh
source scripts/devkitpro-env.sh
fail() { echo "ERROR: $*" >&2; exit 1; }
[ -x "$DEVKITPPC/bin/powerpc-eabi-gcc" ] || fail "powerpc-eabi-gcc not found under $DEVKITPPC. Install devkitPPC (see README.md, 'Installing the toolchain')."
[ -f "$DEVKITPRO/libogc/include/gccore.h" ] || fail "libogc not found under $DEVKITPRO/libogc. Install libogc (see README.md)."
[ -x "$DEVKITPRO/tools/bin/elf2dol" ] || fail "elf2dol not found under $DEVKITPRO/tools/bin. Install gamecube-tools (see README.md)."
"$DEVKITPPC/bin/powerpc-eabi-gcc" --version >/dev/null 2>&1 || fail "the compiler is installed but will not run on this system (a newer glibc is probably needed; see README.md)."
make -j"$(nproc)" package
echo
ls -l dist/apps/owen-minigames/
echo "Built: $(pwd)/dist/apps/owen-minigames/boot.dol"
