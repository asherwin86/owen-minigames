# Source this to put the Wii toolchain on your PATH:   source scripts/devkitpro-env.sh
# It uses a system-wide devkitPro if there is one (/opt/devkitpro), otherwise the per-user install described in
# the README ("Installing the toolchain without root"), which lives under ~/devkitpro-root.
if [ -d /opt/devkitpro/devkitPPC ]; then
  export DEVKITPRO=/opt/devkitpro
else
  export DEVKITPRO="$HOME/devkitpro-root/opt/devkitpro"
fi
export DEVKITPPC="$DEVKITPRO/devkitPPC"
export PATH="$DEVKITPPC/bin:$DEVKITPRO/tools/bin:$HOME/.local/bin:$PATH"
