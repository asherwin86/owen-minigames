/* Dodge It!: steer a little spaceship around falling rocks and sweeping laser beams for as long as you can.
 * Press A to dash (a quick burst of speed during which nothing can hurt you). */
#include "gl.h"
#include "games.h"

#define MAX_O 28
typedef struct { float x, y, vx, vy, r; int kind; float t; bool on; } Obj;   /* kind 0 rock, 1 star, 2 laser (t = warning time) */
static Obj os[MAX_O];
static float px, py, spawn_t, hit_t, dash_t, dash_cd, score_acc, laser_t;
#define PR 16.0f

static void start(void) { for (int i = 0; i < MAX_O; i++) os[i].on = false; px = WORLD_W / 2; py = 400; spawn_t = 0.5f; hit_t = dash_t = dash_cd = score_acc = 0; laser_t = 6; }

static Obj *slot(void) { for (int i = 0; i < MAX_O; i++) if (!os[i].on) return &os[i]; return NULL; }

static void update(float dt, const Input *in) {
  float diff = clampf(R.elapsed / 70.0f, 0, 1);
  /* The ship chases the pointer (or the d-pad); a dash is a short, much faster move. */
  float speed = dash_t > 0 ? 900 : 420;
  float tx = px, ty = py;
  if (in->ir_valid) { tx = in->x; ty = in->y; }
  else {
    if (in->left) tx -= 400;
    if (in->right) tx += 400;
    if (in->up) ty -= 400;
    if (in->down) ty += 400;
  }
  float dx = tx - px, dy = ty - py, d = sqrtf(dx * dx + dy * dy);
  if (d > 1) { float step = fminf(d, speed * dt); px += dx / d * step; py += dy / d * step; }
  px = clampf(px, PR, WORLD_W - PR);
  py = clampf(py, 70, WORLD_H - PR);
  if (dash_t > 0) dash_t -= dt;
  if (dash_cd > 0) dash_cd -= dt;
  if (hit_t > 0) hit_t -= dt;
  if (in->a_down && dash_cd <= 0) { dash_t = 0.25f; dash_cd = 1.6f; audio_sfx(SFX_START); }

  score_acc += dt * 10;
  while (score_acc >= 1) { fw_add_score(1); score_acc -= 1; }

  spawn_t -= dt;
  if (spawn_t <= 0) {
    Obj *o = slot();
    if (o) {
      bool star = chance(0.09f);
      float r = star ? 14 : frand(14, 30);
      *o = (Obj){frand(r, WORLD_W - r), 40, star ? 0 : frand(-60, 60) * diff, frand(150, 260) * (1.0f + 0.9f * diff), r, star ? 1 : 0, 0, true};
    }
    spawn_t = frand(lerpf(0.45f, 0.16f, diff), lerpf(0.7f, 0.3f, diff));
  }
  laser_t -= dt;
  if (laser_t <= 0 && diff > 0.05f) {
    Obj *o = slot();
    if (o) *o = (Obj){0, frand(110, 420), 0, 0, 12, 2, 1.1f, true};
    laser_t = lerpf(7.0f, 3.5f, diff);
  }
  bool vulnerable = hit_t <= 0 && dash_t <= 0;
  for (int i = 0; i < MAX_O; i++) {
    Obj *o = &os[i];
    if (!o->on) continue;
    if (o->kind == 2) {
      o->t -= dt;
      if (o->t < -0.45f) o->on = false;
      else if (o->t < 0 && vulnerable && fabsf(py - o->y) < o->r + PR * 0.6f) { hit_t = 1.4f; fx_burst(px, py, RGB(255, 120, 60), 18); audio_sfx(SFX_HIT); input_rumble(12); fw_lose_life(); vulnerable = false; }
      continue;
    }
    o->x += o->vx * dt; o->y += o->vy * dt;
    if (o->y > WORLD_H + 40 || o->x < -40 || o->x > WORLD_W + 40) { o->on = false; continue; }
    if (!in_circle(px, py, o->x, o->y, o->r + PR * 0.7f)) continue;
    if (o->kind == 1) { o->on = false; fw_add_score(25); fx_burst(o->x, o->y, RGB(255, 230, 80), 10); fx_popup(o->x - 18, o->y - 24, "+25", RGB(255, 230, 80)); audio_sfx(SFX_GOOD); }
    else if (vulnerable) { o->on = false; hit_t = 1.4f; fx_burst(px, py, RGB(255, 120, 60), 18); audio_sfx(SFX_HIT); input_rumble(12); fw_lose_life(); vulnerable = false; }
  }
}

static void draw(void) {
  for (int i = 0; i < 30; i++) { float x = fmodf(i * 97.0f, WORLD_W), y = fmodf(i * 53.0f + R.elapsed * (20 + (i % 5) * 12), 440) + 40; gfx_circle(x, y, 1.5f + (i % 3), RGBA(255, 255, 255, 120)); }
  for (int i = 0; i < MAX_O; i++) {
    const Obj *o = &os[i];
    if (!o->on) continue;
    if (o->kind == 2) {
      if (o->t > 0) { gfx_rect(0, o->y - 3, WORLD_W, 6, RGBA(255, 90, 90, ((int)(o->t * 10) & 1) ? 200 : 90)); gfx_text(8, o->y - 34, 22, RGB(255, 200, 200), "!"); }
      else { gfx_rect(0, o->y - o->r, WORLD_W, o->r * 2, RGBA(255, 70, 70, 230)); gfx_rect(0, o->y - o->r * 0.4f, WORLD_W, o->r * 0.8f, RGB(255, 240, 220)); }
    } else if (o->kind == 1) draw_star(o->x, o->y, o->r + 4, RGB(255, 215, 60));
    else { gfx_circle(o->x, o->y, o->r, RGB(130, 110, 100)); gfx_circle(o->x - o->r * 0.3f, o->y - o->r * 0.3f, o->r * 0.35f, RGB(165, 145, 130)); gfx_circle(o->x + o->r * 0.35f, o->y + o->r * 0.2f, o->r * 0.22f, RGB(95, 80, 75)); }
  }
  bool blink = hit_t > 0 && ((int)(hit_t * 12) & 1);
  if (!blink) {
    if (dash_t > 0) for (int k = 1; k < 5; k++) gfx_tri(px - 14, py + 10 + k * 8, px + 14, py + 10 + k * 8, px, py + 28 + k * 8, RGBA(120, 220, 255, 90));
    gfx_tri(px, py - PR - 4, px + PR, py + PR, px - PR, py + PR, dash_t > 0 ? RGB(120, 230, 255) : RGB(235, 240, 255));
    gfx_circle(px, py + 2, 5, RGB(70, 130, 230));
    gfx_tri(px - 6, py + PR, px + 6, py + PR, px, py + PR + 10 + sinf(R.elapsed * 40) * 3, RGB(255, 170, 60));
  }
  gfx_rect(16, 462, 120, 8, RGBA(255, 255, 255, 60));
  gfx_rect(16, 462, 120 * (1.0f - clampf(dash_cd / 1.6f, 0, 1)), 8, dash_cd <= 0 ? RGB(120, 230, 255) : RGB(90, 140, 190));
  gfx_text(144, 452, 18, RGB(255, 255, 255), "Dash (A)");
}

static void icon(float cx, float cy, float s) {
  gfx_circle(cx - s * 0.22f, cy - s * 0.2f, s * 0.14f, RGB(130, 110, 100)); gfx_circle(cx + s * 0.26f, cy + s * 0.02f, s * 0.1f, RGB(130, 110, 100));
  gfx_tri(cx, cy - s * 0.1f, cx + s * 0.16f, cy + s * 0.3f, cx - s * 0.16f, cy + s * 0.3f, RGB(235, 240, 255));
}

const GameDef game_dodge = {
  "Dodge It!", "How long can you last?",
  {"Move your spaceship to dodge rocks and red lasers.", "Collect gold stars for bonus points.", "Press A to dash: you can't be hurt while dashing.", "You have 3 hearts. Be quick!"},
  "Move: point at the screen   Dash: A", RGB(25, 25, 70), RGB(70, 40, 110), 0, 3, start, update, draw, icon, CUR_NONE};
