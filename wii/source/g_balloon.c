/* Balloon Pop: point at balloons and press A before they float away; bombs cost points.
 * Rules follow js/games/balloon-pop.js: 50 second round, +10 per balloon, 12% bombs worth -15. */
#include "gl.h"
#include "games.h"

#define MAX_B 24
typedef struct { float x, y, vy, r, wob; Color c; bool bomb, on; } Balloon;
static Balloon bs[MAX_B];
static float spawn_t;
static int combo;
static float shake;

static const Color PALETTE[6] = {RGB(255, 90, 100), RGB(255, 200, 60), RGB(100, 220, 140), RGB(90, 170, 255), RGB(200, 120, 255), RGB(255, 140, 60)};

static void start(void) { for (int i = 0; i < MAX_B; i++) bs[i].on = false; spawn_t = 0.3f; combo = 0; shake = 0; }

static void spawn(void) {
  float diff = clampf(R.elapsed / 50.0f, 0, 1);
  for (int i = 0; i < MAX_B; i++) {
    if (bs[i].on) continue;
    bool bomb = chance(0.12f);
    float r = bomb ? 26 : frand(28, 40);
    bs[i] = (Balloon){frand(50, 590), WORLD_H + r * 2, -frand(70, 150) * (1.0f + 0.7f * diff), r, frand(0, 6.28f), PALETTE[irand(6)], bomb, true};
    return;
  }
}

static void update(float dt, const Input *in) {
  float diff = clampf(R.elapsed / 50.0f, 0, 1);
  spawn_t -= dt;
  if (spawn_t <= 0) { spawn(); spawn_t = lerpf(0.85f, 0.32f, diff) * frand(0.7f, 1.2f); }
  if (shake > 0) shake -= dt;
  for (int i = 0; i < MAX_B; i++) {
    if (!bs[i].on) continue;
    bs[i].y += bs[i].vy * dt;
    bs[i].wob += dt * 2.2f;
    if (bs[i].y < 40 - bs[i].r * 2) { if (!bs[i].bomb) combo = 0; bs[i].on = false; }
  }
  if (in->a_down) {
    bool hit = false;
    for (int i = MAX_B - 1; i >= 0 && !hit; i--) {
      Balloon *b = &bs[i];
      float bx = b->x + sinf(b->wob) * 8;
      if (!b->on || !in_circle(in->x, in->y, bx, b->y, b->r * 1.05f)) continue;
      hit = true; b->on = false;
      if (b->bomb) {
        fw_add_score(-15); combo = 0; shake = 0.35f;
        fx_burst(bx, b->y, RGB(255, 160, 40), 22); fx_popup(bx, b->y - 20, "-15", RGB(255, 110, 110));
        audio_sfx(SFX_BAD); input_rumble(14);
      } else {
        int pts = 10 + (combo < 5 ? combo : 5) * 2;
        combo++;
        fw_add_score(pts);
        char t[16]; snprintf(t, sizeof t, "+%d", pts);
        fx_burst(bx, b->y, b->c, 14); fx_popup(bx, b->y - 20, t, RGB(255, 255, 255));
        audio_sfx(SFX_POP);
      }
    }
    if (!hit) combo = 0;
  }
  (void)in;
}

static void draw(void) {
  float ox = shake > 0 ? sinf(shake * 90) * 6 : 0;
  for (int i = 0; i < 4; i++) { float cx = fmodf(60 + i * 190 + R.elapsed * (8 + i * 3), 760) - 60; gfx_ellipse(cx, 120 + i * 80, 60, 20, RGBA(255, 255, 255, 40)); gfx_ellipse(cx + 30, 112 + i * 80, 40, 18, RGBA(255, 255, 255, 40)); }
  for (int i = 0; i < MAX_B; i++) {
    if (!bs[i].on) continue;
    float bx = bs[i].x + sinf(bs[i].wob) * 8 + ox;
    if (bs[i].bomb) draw_bomb(bx, bs[i].y, bs[i].r); else draw_balloon(bx, bs[i].y, bs[i].r, bs[i].c);
  }
  if (combo >= 3) { char t[24]; snprintf(t, sizeof t, "Combo x%d", combo); gfx_text_center(WORLD_W * 0.5f, 56, 24, RGB(255, 235, 120), t); }
}

static void icon(float cx, float cy, float s) { draw_balloon(cx - s * 0.18f, cy - s * 0.12f, s * 0.32f, RGB(255, 90, 100)); draw_balloon(cx + s * 0.2f, cy + s * 0.05f, s * 0.26f, RGB(255, 210, 70)); }

const GameDef game_balloon = {
  "Balloon Pop", "Pop them all!",
  {"Point the Wii Remote at a balloon and press A to pop it.", "Pop balloons in a row to build a combo bonus.", "Bombs cost you points, so leave those alone!", NULL},
  "Aim: point at the screen   Pop: A", RGB(70, 150, 235), RGB(150, 210, 255), 50, 0, start, update, draw, icon, CUR_CROSSHAIR, INP_POINT | INP_A, 150, 300};
