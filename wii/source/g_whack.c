/* Whack-a-Mole: a 3x3 field. Moles pop up faster and in more places as the round goes on. Rules follow
 * js/games/whack-a-mole.js (40 second round). A golden mole is worth three, a bomb mole costs points. */
#include "gl.h"
#include "games.h"

#define N 9
typedef struct { float t, dur; int kind; bool up, hit; float hit_t; } Hole;   /* kind: 0 normal, 1 golden, 2 bomb */
static Hole holes[N];
static float spawn_t, swing;
static const float HX[3] = {150, 320, 490}, HY[3] = {185, 305, 425};

static void start(void) { for (int i = 0; i < N; i++) holes[i] = (Hole){0}; spawn_t = 0.6f; swing = 0; }

static int ups(void) { int n = 0; for (int i = 0; i < N; i++) if (holes[i].up) n++; return n; }

static void update(float dt, const Input *in) {
  float diff = clampf(R.elapsed / 40.0f, 0, 1);
  spawn_t -= dt;
  if (spawn_t <= 0) {
    int free_idx[N], nf = 0;
    for (int i = 0; i < N; i++) if (!holes[i].up && holes[i].hit_t <= 0) free_idx[nf++] = i;
    if (nf > 0 && ups() < 1 + (int)(diff * 2.5f)) {
      int i = free_idx[irand(nf)];
      float r = frand(0, 1);
      holes[i] = (Hole){0, lerpf(1.15f, 0.62f, diff), r < 0.10f ? 1 : (r < 0.20f ? 2 : 0), true, false, 0};
    }
    spawn_t = frand(lerpf(0.7f, 0.4f, diff), lerpf(1.0f, 0.6f, diff));
  }
  if (swing > 0) swing -= dt;
  for (int i = 0; i < N; i++) {
    Hole *h = &holes[i];
    if (h->hit_t > 0) h->hit_t -= dt;
    if (!h->up) continue;
    h->t += dt;
    if (h->t >= h->dur) h->up = false;
  }
  if (in->a_down) {
    swing = 0.2f;
    bool hit = false;
    for (int i = 0; i < N && !hit; i++) {
      Hole *h = &holes[i];
      if (!h->up || !in_circle(in->x, in->y, HX[i % 3], HY[i / 3] - 14, 54)) continue;
      hit = true; h->up = false; h->hit = true; h->hit_t = 0.35f;
      float x = HX[i % 3], y = HY[i / 3] - 30;
      if (h->kind == 2) { fw_add_score(-15); fx_popup(x, y, "-15", RGB(255, 110, 110)); audio_sfx(SFX_BAD); input_rumble(14); fx_burst(x, y, RGB(255, 150, 40), 16); }
      else { int pts = h->kind == 1 ? 30 : 10; fw_add_score(pts); char t[16]; snprintf(t, sizeof t, "+%d", pts); fx_popup(x, y, t, h->kind == 1 ? RGB(255, 230, 80) : RGB(255, 255, 255)); audio_sfx(SFX_HIT); input_rumble(5); fx_burst(x, y, RGB(255, 220, 140), 12); }
    }
    if (!hit) audio_sfx(SFX_CLICK);
  }
}

static void draw(void) {
  const Color grass = RGB(88, 160, 70);
  gfx_rect(0, 90, WORLD_W, 400, grass);
  for (int i = 0; i < N; i++) {
    float x = HX[i % 3], y = HY[i / 3];
    const Hole *h = &holes[i];
    gfx_ellipse(x, y + 4, 62, 24, RGB(55, 36, 22));
    if (h->up || h->hit_t > 0) {
      float rise = h->up ? clampf(h->t / 0.12f, 0, 1) * clampf((h->dur - h->t) / 0.12f, 0, 1) : 1.0f;
      float squash = h->hit_t > 0 ? 0.55f : 1.0f;
      float my = y + 46 - 72 * rise;
      Color body = h->kind == 1 ? RGB(255, 205, 60) : (h->kind == 2 ? RGB(70, 70, 85) : RGB(150, 100, 60));
      gfx_ellipse(x, my, 36, 42 * squash, body);
      gfx_circle(x - 12, my - 8 * squash, 6, RGB(255, 255, 255));
      gfx_circle(x + 12, my - 8 * squash, 6, RGB(255, 255, 255));
      gfx_circle(x - 12, my - 8 * squash, 3, RGB(20, 20, 20));
      gfx_circle(x + 12, my - 8 * squash, 3, RGB(20, 20, 20));
      gfx_ellipse(x, my + 8 * squash, 9, 6 * squash, h->kind == 2 ? RGB(230, 70, 70) : RGB(240, 150, 150));
      if (h->kind == 2) { gfx_line(x - 18, my - 20, x - 6, my - 14, 3, RGB(255, 80, 80)); gfx_line(x + 18, my - 20, x + 6, my - 14, 3, RGB(255, 80, 80)); }
    }
    gfx_rect(x - 66, y + 4, 132, 64, grass);                    /* the front lip of the hole hides the rest of the mole */
  }
}

static void icon(float cx, float cy, float s) {
  gfx_ellipse(cx, cy + s * 0.3f, s * 0.42f, s * 0.14f, RGB(60, 40, 25));
  gfx_ellipse(cx, cy, s * 0.26f, s * 0.3f, RGB(150, 100, 60));
  gfx_circle(cx - s * 0.09f, cy - s * 0.07f, s * 0.045f, RGB(255, 255, 255)); gfx_circle(cx + s * 0.09f, cy - s * 0.07f, s * 0.045f, RGB(255, 255, 255));
  gfx_ellipse(cx, cy + s * 0.06f, s * 0.07f, s * 0.045f, RGB(240, 150, 150));
}

const GameDef game_whack = {
  "Whack-a-Mole", "Bonk the moles!",
  {"Point at a mole and press A to whack it.", "Golden moles are worth 3 times as much.", "Don't hit the grumpy grey bomb moles!", NULL},
  "Aim: point at the screen   Whack: A", RGB(110, 190, 90), RGB(60, 130, 70), 40, 0, start, update, draw, icon, CUR_HAMMER, INP_POINT | INP_A, 150, 300};
