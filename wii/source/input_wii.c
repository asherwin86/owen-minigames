/* Wii Remote back end for input.h. */
#include <gccore.h>
#include <ogc/lwp_watchdog.h>
#include <wiiuse/wpad.h>
#include <string.h>
#include "input.h"

static float screen_w = WORLD_W;
static float cursor_x = WORLD_W / 2, cursor_y = WORLD_H / 2;      /* d-pad cursor, used when the remote cannot see the sensor bar */
static float smooth_x = -1, smooth_y = -1;
static int rumble_left = 0;
static u64 last_tick = 0, last_flick = 0;

void input_init(float sw) {
  screen_w = sw;
  WPAD_Init();
  WPAD_SetDataFormat(WPAD_CHAN_0, WPAD_FMT_BTNS_ACC_IR);
  WPAD_SetVRes(WPAD_CHAN_0, 640, 480);          /* IR positions come back in a 640x480 space whatever the video mode */
  last_tick = gettime();
}

void input_rumble(int frames) { rumble_left = frames; }

void input_poll(Input *in) {
  memset(in, 0, sizeof(*in));
  u64 now = gettime();
  float dt = (float)ticks_to_microsecs(now - last_tick) / 1e6f;
  last_tick = now;
  if (dt > 0.1f) dt = 0.1f;

  WPAD_ScanPads();
  u32 type = 0;
  in->connected = (WPAD_Probe(WPAD_CHAN_0, &type) == WPAD_ERR_NONE);
  if (!in->connected) { WPAD_Rumble(WPAD_CHAN_0, 0); return; }

  u32 down = WPAD_ButtonsDown(WPAD_CHAN_0), held = WPAD_ButtonsHeld(WPAD_CHAN_0);
  in->a = held & WPAD_BUTTON_A;           in->a_down = down & WPAD_BUTTON_A;
  in->b = held & WPAD_BUTTON_B;           in->b_down = down & WPAD_BUTTON_B;
  in->one = held & WPAD_BUTTON_1;         in->two = held & WPAD_BUTTON_2;
  in->one_down = down & WPAD_BUTTON_1;    in->two_down = down & WPAD_BUTTON_2;
  in->plus_down = down & WPAD_BUTTON_PLUS; in->minus_down = down & WPAD_BUTTON_MINUS;
  in->home_down = down & WPAD_BUTTON_HOME;
  in->left = held & WPAD_BUTTON_LEFT;     in->right = held & WPAD_BUTTON_RIGHT;
  in->up = held & WPAD_BUTTON_UP;         in->down = held & WPAD_BUTTON_DOWN;
  in->left_down = down & WPAD_BUTTON_LEFT; in->right_down = down & WPAD_BUTTON_RIGHT;
  in->up_down = down & WPAD_BUTTON_UP;     in->down_down = down & WPAD_BUTTON_DOWN;

  /* Pointer: IR when the sensor bar is in view, otherwise a cursor the d-pad moves. */
  ir_t ir;
  WPAD_IR(WPAD_CHAN_0, &ir);
  float ox = (screen_w - WORLD_W) * 0.5f;
  if (ir.valid) {
    float wx = ir.x / 640.0f * screen_w - ox, wy = ir.y;
    if (smooth_x < 0) { smooth_x = wx; smooth_y = wy; }
    smooth_x = lerpf(smooth_x, wx, 0.55f);     /* a little smoothing: the raw IR pointer jitters */
    smooth_y = lerpf(smooth_y, wy, 0.55f);
    cursor_x = smooth_x; cursor_y = smooth_y;
    in->ir_valid = true;
  } else {
    smooth_x = -1;
    float sp = 300.0f * dt;
    if (in->left) cursor_x -= sp;
    if (in->right) cursor_x += sp;
    if (in->up) cursor_y -= sp;
    if (in->down) cursor_y += sp;
  }
  cursor_x = clampf(cursor_x, 0, WORLD_W);
  cursor_y = clampf(cursor_y, 0, WORLD_H);
  in->x = cursor_x; in->y = cursor_y;

  /* Motion: roll for steering, and a sharp swing counts as a flick. */
  orient_t o;
  WPAD_Orientation(WPAD_CHAN_0, &o);
  in->tilt = clampf(o.roll / 45.0f, -1.0f, 1.0f);
  gforce_t g;
  WPAD_GForce(WPAD_CHAN_0, &g);
  float mag = sqrtf(g.x * g.x + g.y * g.y + g.z * g.z);
  if (mag > 2.4f && ticks_to_millisecs(now - last_flick) > 450) { in->flick = true; last_flick = now; }

  WPAD_Rumble(WPAD_CHAN_0, rumble_left > 0);
  if (rumble_left > 0) rumble_left--;
}
