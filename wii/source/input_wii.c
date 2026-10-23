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
static bool rumble_enabled = true;
static u64 last_tick = 0, last_flick = 0;


#ifdef AUTOPILOT
/* EMULATOR-CHECK BUILD ONLY (make EXTRA_CFLAGS=-DAUTOPILOT BUILD=build-ap OUTDIR=out-ap). Replaces the real Wii Remote with a
 * script that moves the pointer and presses buttons on a timer, so the app can be run unattended in Dolphin and its window
 * captured. It is never part of the normal build or the USB deployment. */
typedef struct { float t, x, y; unsigned press; } Step;      /* press bits: 1=A 2=B 4=+ 8=HOME 16=B(held) */
static const Step SCRIPT[] = {
  {0.0f, 320, 240, 0}, {3.0f, 320, 417, 0}, {4.0f, 320, 417, 1},            /* title -> Options */
  {6.5f, 320, 158, 0}, {7.0f, 320, 158, 1}, {8.5f, 320, 373, 0}, {9.0f, 320, 373, 1},   /* toggle music, Back */
  {10.5f, 320, 348, 0}, {11.0f, 320, 348, 1},                               /* Play -> game menu */
  {13.0f, 397, 112, 0}, {14.5f, 397, 112, 0}, {15.0f, 397, 112, 1},         /* Whack-a-Mole tile -> instructions */
  {18.0f, 215, 432, 0}, {18.6f, 215, 432, 1},                               /* Start -> countdown */
  {1000.0f, 0, 0, 0},
};
static float ap_x = 320, ap_y = 240; static int ap_idx = 0; static u64 ap_start = 0; static bool ap_inited = false;
static void autopilot(Input *in, float dt) {
  if (!ap_inited) { ap_inited = true; ap_start = gettime(); }
  float t = (float)ticks_to_microsecs(gettime() - ap_start) / 1e6f;
  const Step *cur = &SCRIPT[ap_idx];
  while (SCRIPT[ap_idx + 1].t <= t && SCRIPT[ap_idx + 1].t < 999) { ap_idx++; cur = &SCRIPT[ap_idx]; if (cur->press & 1) in->a_down = true; if (cur->press & 2) in->b_down = true; }
  float tx = cur->x, ty = cur->y, dx = tx - ap_x, dy = ty - ap_y, d = sqrtf(dx * dx + dy * dy), step = 900.0f * dt;
  if (d > 1) { float k = d < step ? 1.0f : step / d; ap_x += dx * k; ap_y += dy * k; }
  in->connected = true; in->ir_valid = true; in->x = ap_x; in->y = ap_y;
  if (t > 24.0f && t < 60.0f) {                                         /* in the game: sweep over the holes and whack */
    static const float HX[3] = {150, 320, 490}, HY[3] = {170, 290, 410};
    int cell = ((int)(t * 2.2f)) % 9;
    in->x = ap_x = HX[cell % 3]; in->y = ap_y = HY[cell / 3] - 10;
    if (((int)(t * 8)) % 3 == 0 && ((int)(t * 8)) != ((int)((t - dt) * 8))) in->a_down = true;
    if (t > 40.0f && t < 40.3f) in->plus_down = true;                    /* pause for a moment */
    if (t > 42.5f && t < 42.8f) { in->x = 320; in->y = 223; in->a_down = true; }   /* Resume */
  }
}
#endif

void input_init(float sw) {
  screen_w = sw;
  WPAD_Init();
  WPAD_SetDataFormat(WPAD_CHAN_0, WPAD_FMT_BTNS_ACC_IR);
  WPAD_SetVRes(WPAD_CHAN_0, 640, 480);          /* IR positions come back in a 640x480 space whatever the video mode */
  last_tick = gettime();
}

void input_rumble(int frames) { if (rumble_enabled) rumble_left = frames; }
void input_set_rumble(int enabled) { rumble_enabled = enabled != 0; if (!rumble_enabled) rumble_left = 0; }

void input_poll(Input *in) {
  memset(in, 0, sizeof(*in));
  u64 now = gettime();
  float dt = (float)ticks_to_microsecs(now - last_tick) / 1e6f;
  last_tick = now;
  if (dt > 0.1f) dt = 0.1f;

#ifdef AUTOPILOT
  autopilot(in, dt);
  return;
#endif
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
    /* No sensor bar: the +Control Pad moves the cursor, starting gently for precise aiming and speeding up the longer it is held. */
    static float held = 0;
    float dx = (in->right ? 1.0f : 0.0f) - (in->left ? 1.0f : 0.0f), dy = (in->down ? 1.0f : 0.0f) - (in->up ? 1.0f : 0.0f);
    if (dx != 0 || dy != 0) {
      held += dt;
      float speed = 230.0f + 520.0f * clampf(held / 0.7f, 0, 1), len = sqrtf(dx * dx + dy * dy);
      cursor_x += dx / len * speed * dt;
      cursor_y += dy / len * speed * dt;
    } else held = 0;
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
