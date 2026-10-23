/* Owen's Minigames: entry point and main loop. */
#include <gccore.h>
#include <ogc/lwp_watchdog.h>
#include <stdlib.h>
#include "common.h"
#include "gfx.h"
#include "input.h"
#include "audio.h"
#include "fw.h"

static volatile bool reset_requested = false, power_requested = false;
static void on_reset(u32 irq, void *ctx) { (void)irq; (void)ctx; reset_requested = true; }
static void on_power(void) { power_requested = true; }

int main(void) {
  SYS_SetResetCallback(on_reset);              /* the console's Reset and Power buttons only set flags; the loop below acts on them */
  SYS_SetPowerCallback(on_power);

  gfx_init();
  input_init(g_screen_w);
  audio_init();
  rng_seed((uint32_t)gettime());
  fw_init();
  audio_music(1);

  u64 last = gettime();
  while (!fw_wants_exit() && !reset_requested && !power_requested) {
    Input in;
    input_poll(&in);
    u64 now = gettime();
    float dt = (float)ticks_to_microsecs(now - last) / 1e6f;
    last = now;
    if (dt > 0.05f) dt = 0.05f;                /* after a stall, don't let the game jump ahead */
    fw_update(dt, &in);
    gfx_begin();
    fw_draw();
    gfx_end();                                 /* waits for vsync, so this loop runs at the TV's refresh rate */
  }

  audio_shutdown();
  if (power_requested) SYS_ResetSystem(SYS_POWEROFF, 0, 0);
  exit(0);                                     /* back to the Homebrew Channel / USB Loader GX that started us */
  SYS_ResetSystem(SYS_RETURNTOMENU, 0, 0);     /* only reached if there is no loader to return to */
  return 0;
}
