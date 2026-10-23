/* Target Practice: shoot targets that appear in different places. Closer to the middle and quicker scores more.
 * A target that runs out of time costs a life. */
#include "gl.h"
#include "games.h"

#define MAX_T 3
typedef struct { float x, y, r, life, max_life; bool on; } Target;
static Target ts[MAX_T];
static float spawn_t;
static int shots, hits;
static float flash, flash_x, flash_y;

static void start(void) { for (int i = 0; i < MAX_T; i++) ts[i].on = false; spawn_t = 0.4f; shots = hits = 0; flash = 0; }

static void spawn(void) {
  float diff = clampf(R.elapsed / 45.0f, 0, 1);
  for (int i = 0; i < MAX_T; i++) {
    if (ts[i].on) continue;
    float r = frand(40, 56) * (1.0f - 0.25f * diff), life = lerpf(2.8f, 1.6f, diff);
    for (int tries = 0; tries < 12; tries++) {
      float x = frand(r + 20, WORLD_W - r - 20), y = frand(70 + r, WORLD_H - r - 20);
      bool clash = false;
      for (int k = 0; k < MAX_T; k++) if (ts[k].on && sqf(ts[k].x - x) + sqf(ts[k].y - y) < sqf(ts[k].r + r + 10)) clash = true;
      if (!clash) { ts[i] = (Target){x, y, r, life, life, true}; return; }
    }
    return;
  }
}

static int active(void) { int n = 0; for (int i = 0; i < MAX_T; i++) if (ts[i].on) n++; return n; }

static void update(float dt, const Input *in) {
  float diff = clampf(R.elapsed / 45.0f, 0, 1);
  int want = 1 + (int)(diff * 2.2f);
  spawn_t -= dt;
  if (spawn_t <= 0 && active() < want) { spawn(); spawn_t = lerpf(0.7f, 0.35f, diff); }
  if (flash > 0) flash -= dt;
  for (int i = 0; i < MAX_T; i++) {
    if (!ts[i].on) continue;
    ts[i].life -= dt;
    if (ts[i].life <= 0) {
      ts[i].on = false;
      fx_burst(ts[i].x, ts[i].y, RGB(255, 90, 90), 12);
      audio_sfx(SFX_MISS); fw_lose_life();
    }
  }
  if (in->a_down) {
    shots++;
    flash = 0.12f; flash_x = in->x; flash_y = in->y;
    bool hit = false;
    for (int i = 0; i < MAX_T && !hit; i++) {
      Target *t = &ts[i];
      if (!t->on) continue;
      float d = sqrtf(sqf(in->x - t->x) + sqf(in->y - t->y));
      if (d > t->r) continue;
      hit = true; hits++;
      int pts = d < t->r * 0.25f ? 100 : (d < t->r * 0.55f ? 60 : 30);
      int bonus = (int)(40.0f * t->life / t->max_life);
      fw_add_score(pts + bonus);
      char s[20]; snprintf(s, sizeof s, "+%d", pts + bonus);
      fx_burst(t->x, t->y, pts == 100 ? RGB(255, 230, 80) : RGB(255, 255, 255), 16);
      fx_popup(t->x - 20, t->y - 30, s, pts == 100 ? RGB(255, 230, 80) : RGB(255, 255, 255));
      audio_sfx(pts == 100 ? SFX_GOOD : SFX_HIT);
      t->on = false;
    }
    if (!hit) audio_sfx(SFX_CLICK);
  }
}

static void draw(void) {
  for (int i = 0; i < 6; i++) gfx_rect(0, 100 + i * 70, WORLD_W, 2, RGBA(255, 255, 255, 18));
  for (int i = 0; i < MAX_T; i++) {
    const Target *t = &ts[i];
    if (!t->on) continue;
    float f = t->life / t->max_life;
    gfx_circle(t->x, t->y, t->r, RGB(250, 250, 250));
    gfx_circle(t->x, t->y, t->r * 0.8f, RGB(230, 60, 60));
    gfx_circle(t->x, t->y, t->r * 0.55f, RGB(250, 250, 250));
    gfx_circle(t->x, t->y, t->r * 0.35f, RGB(230, 60, 60));
    gfx_circle(t->x, t->y, t->r * 0.15f, RGB(255, 215, 60));
    gfx_ring(t->x, t->y, t->r + 4, t->r + 8, f > 0.35f ? RGBA(120, 255, 150, 220) : RGBA(255, 90, 90, 230));
  }
  if (flash > 0) gfx_circle(flash_x, flash_y, 22 * (flash / 0.12f), RGBA(255, 255, 220, 160));
  char b[40]; snprintf(b, sizeof b, "Accuracy %d%%", shots ? hits * 100 / shots : 100);
  gfx_text(16, 452, 20, RGB(255, 255, 255), b);
}

static void icon(float cx, float cy, float s) {
  float r = s * 0.42f;
  gfx_circle(cx, cy, r, RGB(250, 250, 250)); gfx_circle(cx, cy, r * 0.78f, RGB(230, 60, 60)); gfx_circle(cx, cy, r * 0.55f, RGB(250, 250, 250)); gfx_circle(cx, cy, r * 0.32f, RGB(230, 60, 60)); gfx_circle(cx, cy, r * 0.13f, RGB(255, 215, 60));
}

const GameDef game_target = {
  "Target Practice", "Straight to the bullseye!",
  {"Aim the Wii Remote at a target and press A to fire.", "Hit near the middle and be quick for more points.", "If a target runs out of time you lose a heart.", NULL},
  "Aim: point at the screen   Fire: A", RGB(60, 130, 90), RGB(30, 80, 60), 45, 3, start, update, draw, icon, CUR_CROSSHAIR, INP_POINT | INP_A, 600, 1200};
