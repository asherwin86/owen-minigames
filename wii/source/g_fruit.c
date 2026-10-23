/* Fruit Catcher: slide the basket under falling fruit. Missing a fruit or catching a bomb costs a heart, as in
 * js/games/fruit-catch.js (3 lives, 15% bombs, +10 per fruit). */
#include "gl.h"
#include "games.h"

#define MAX_F 20
typedef struct { float x, y, vy, spin; int kind; bool on; } Fruit;   /* kind 0..3 fruit, 4 bomb, 5 golden */
static Fruit fs[MAX_F];
static float bx, spawn_t, hurt;
static int streak;
#define BASKET_W 110.0f
#define BASKET_Y 430.0f

static const Color FRUIT_COL[4] = {RGB(230, 60, 60), RGB(255, 160, 40), RGB(255, 225, 70), RGB(150, 80, 200)};

static void start(void) { for (int i = 0; i < MAX_F; i++) fs[i].on = false; bx = WORLD_W / 2; spawn_t = 0.5f; hurt = 0; streak = 0; }

static void spawn(void) {
  float diff = clampf(R.elapsed / 60.0f, 0, 1);
  for (int i = 0; i < MAX_F; i++) {
    if (fs[i].on) continue;
    float r = frand(0, 1);
    int kind = r < 0.15f ? 4 : (r < 0.20f ? 5 : irand(4));
    fs[i] = (Fruit){frand(40, 600), 40, frand(150, 230) * (1.0f + 0.9f * diff), frand(0, 6.28f), kind, true};
    return;
  }
}

static void update(float dt, const Input *in) {
  float diff = clampf(R.elapsed / 60.0f, 0, 1);
  /* Steering: pointing at the screen moves the basket straight to that spot; otherwise the d-pad slides it. */
  float target = bx;
  if (in->ir_valid) target = in->x;
  else if (in->left) target = bx - 520 * dt;
  else if (in->right) target = bx + 520 * dt;
  else if (fabsf(in->tilt) > 0.15f) target = bx + in->tilt * 520 * dt;
  bx = clampf(lerpf(bx, target, in->ir_valid ? 0.35f : 1.0f), BASKET_W * 0.5f, WORLD_W - BASKET_W * 0.5f);
  if (hurt > 0) hurt -= dt;

  spawn_t -= dt;
  if (spawn_t <= 0) { spawn(); spawn_t = frand(lerpf(0.8f, 0.4f, diff), lerpf(1.2f, 0.7f, diff)); }
  for (int i = 0; i < MAX_F; i++) {
    Fruit *f = &fs[i];
    if (!f->on) continue;
    f->y += f->vy * dt; f->spin += dt * 4;
    bool caught = f->y > BASKET_Y - 14 && f->y < BASKET_Y + 24 && fabsf(f->x - bx) < BASKET_W * 0.5f + 8;
    if (caught) {
      f->on = false;
      if (f->kind == 4) {
        fx_burst(f->x, f->y, RGB(255, 160, 40), 20); audio_sfx(SFX_BAD); input_rumble(14);
        streak = 0; hurt = 0.5f; fw_lose_life();
      } else {
        int pts = f->kind == 5 ? 50 : 10 + (streak < 10 ? streak : 10);
        streak++;
        fw_add_score(pts);
        char t[16]; snprintf(t, sizeof t, "+%d", pts);
        fx_popup(f->x, f->y - 30, t, f->kind == 5 ? RGB(255, 230, 80) : RGB(255, 255, 255));
        fx_burst(f->x, BASKET_Y, f->kind == 5 ? RGB(255, 230, 80) : FRUIT_COL[f->kind], 6);
        audio_sfx(f->kind == 5 ? SFX_GOOD : SFX_POP);
      }
    } else if (f->y > WORLD_H + 20) {
      f->on = false;
      if (f->kind < 4) { streak = 0; audio_sfx(SFX_MISS); hurt = 0.4f; fw_lose_life(); }
    }
  }
}

static void draw_fruit(const Fruit *f) {
  float x = f->x, y = f->y;
  switch (f->kind) {
    case 0: gfx_circle(x, y, 20, FRUIT_COL[0]); gfx_circle(x - 6, y - 7, 5, RGBA(255, 255, 255, 120)); gfx_line(x, y - 20, x + 3, y - 30, 3, RGB(110, 70, 30)); gfx_ellipse(x + 8, y - 26, 8, 4, RGB(90, 200, 90)); break;
    case 1: gfx_circle(x, y, 21, FRUIT_COL[1]); gfx_circle(x - 6, y - 7, 5, RGBA(255, 255, 255, 110)); gfx_circle(x, y - 20, 3, RGB(70, 150, 70)); break;
    case 2: gfx_ellipse(x, y, 30, 11, FRUIT_COL[2]); gfx_ellipse(x - 2, y - 3, 24, 6, RGBA(255, 255, 255, 80)); gfx_circle(x + 28, y, 3, RGB(110, 80, 40)); break;
    case 3: for (int k = 0; k < 6; k++) gfx_circle(x - 12 + (k % 3) * 12, y - 10 + (k / 3) * 13 + (k % 3 == 1 ? 6 : 0), 9, FRUIT_COL[3]); gfx_line(x, y - 20, x + 4, y - 30, 3, RGB(110, 70, 30)); break;
    case 4: draw_bomb(x, y, 20); break;
    default: draw_star(x, y, 24 + sinf(f->spin) * 3, RGB(255, 215, 60)); break;
  }
}

static void draw(void) {
  gfx_rect(0, 462, WORLD_W, 18, RGB(110, 80, 50));
  for (int i = 0; i < MAX_F; i++) if (fs[i].on) draw_fruit(&fs[i]);
  float w = BASKET_W, x = bx - w / 2;
  gfx_quad(x, BASKET_Y - 8, x + w, BASKET_Y - 8, x + w - 14, BASKET_Y + 34, x + 14, BASKET_Y + 34, hurt > 0 ? RGB(230, 80, 80) : RGB(190, 130, 70));
  gfx_rect(x - 4, BASKET_Y - 14, w + 8, 10, hurt > 0 ? RGB(255, 120, 120) : RGB(220, 160, 90));
  for (int k = 1; k < 4; k++) gfx_line(x + w * k / 4.0f, BASKET_Y - 4, x + w * k / 4.0f * 0.9f + w * 0.05f, BASKET_Y + 32, 2, RGBA(110, 70, 30, 150));
  if (streak >= 3) { char t[24]; snprintf(t, sizeof t, "Streak %d", streak); gfx_text_center(WORLD_W * 0.5f, 56, 24, RGB(255, 235, 120), t); }
}

static void icon(float cx, float cy, float s) {
  gfx_circle(cx - s * 0.14f, cy - s * 0.1f, s * 0.2f, RGB(230, 60, 60)); gfx_circle(cx + s * 0.16f, cy - s * 0.04f, s * 0.19f, RGB(255, 160, 40));
  gfx_quad(cx - s * 0.36f, cy + s * 0.12f, cx + s * 0.36f, cy + s * 0.12f, cx + s * 0.28f, cy + s * 0.36f, cx - s * 0.28f, cy + s * 0.36f, RGB(190, 130, 70));
}

const GameDef game_fruit = {
  "Fruit Catcher", "Catch the yummy fruit!",
  {"Move the basket to catch the falling fruit.", "Missing a fruit, or catching a bomb, costs a heart.", "Golden stars are worth 50!", NULL},
  "Move: point at the screen, or the +Control Pad", RGB(255, 170, 90), RGB(255, 110, 120), 0, 3, start, update, draw, icon, CUR_NONE};
