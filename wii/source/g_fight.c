/* Fist Fury: a side-on fighting game against a line of five computer opponents, each tougher than the last.
 * +Control Pad moves (Up jumps), A punches, B kicks, hold 1 to block. Win a fight and you recover a little health and face
 * the next fighter. Score comes from damage dealt, knock-outs and health left. */
#include "gl.h"
#include "games.h"

enum { S_IDLE, S_WALK, S_PUNCH, S_KICK, S_HURT, S_KO };
typedef struct {
  float x, y, vy, hp, st, hurt_st;
  int face, state;
  bool block, hit_done, air;
} Fighter;
#define FLOOR_Y 410.0f
#define ARENA_L 50.0f
#define ARENA_R 590.0f
#define OPPONENTS 5

typedef struct { float dur, active0, active1, range, dmg, push; } Move;
static const Move PUNCH = {0.30f, 0.08f, 0.18f, 74, 8, 40}, KICK = {0.46f, 0.16f, 0.28f, 96, 13, 70};

static Fighter pl, cpu;
static int level, defeated, combo;
static float ai_t, ko_t, announce_t, combo_t, shake;
static const char *const NAMES[OPPONENTS] = {"Rusty", "Ninja Nate", "Big Bella", "Captain Kick", "Master Wu"};
static const Color BODY[OPPONENTS] = {RGB(220, 90, 80), RGB(70, 80, 140), RGB(60, 170, 110), RGB(240, 160, 50), RGB(160, 90, 210)};

static void spawn_cpu(void) {
  cpu = (Fighter){ARENA_R - 100, FLOOR_Y, 0, 90.0f + 10.0f * level, 0, 0, -1, S_IDLE, false, false, false};
  ai_t = 0.8f; announce_t = 1.4f;
}

static void start(void) {
  level = 0; defeated = 0; combo = 0; combo_t = shake = ko_t = 0;
  pl = (Fighter){ARENA_L + 100, FLOOR_Y, 0, 100, 0, 0, 1, S_IDLE, false, false, false};
  spawn_cpu();
}

static void begin_attack(Fighter *f, int state) { f->state = state; f->st = 0; f->hit_done = false; f->block = false; }

/* Applies an attack that is in its active frames. Returns true if it landed. */
static bool resolve(Fighter *a, Fighter *d, const Move *m, float dmg_scale, bool by_player) {
  if (a->hit_done || a->st < m->active0 || a->st > m->active1 || d->state == S_KO) return false;
  float dx = (d->x - a->x) * a->face;
  if (dx < -10 || dx > m->range || fabsf(d->y - a->y) > 55) return false;
  a->hit_done = true;
  bool blocked = d->block && d->face == -a->face && !d->air;
  float dmg = m->dmg * dmg_scale * (blocked ? 0.15f : 1.0f);
  d->hp -= dmg;
  d->x = clampf(d->x + a->face * m->push * (blocked ? 0.4f : 1.0f), ARENA_L, ARENA_R);
  if (blocked) { audio_sfx(SFX_CLICK); fx_burst(d->x - a->face * 14, d->y - 70, RGB(160, 200, 255), 5); }
  else {
    d->state = S_HURT; d->st = 0; d->hit_done = true; d->block = false;
    audio_sfx(SFX_HIT); fx_burst(d->x - a->face * 10, d->y - 80, RGB(255, 230, 120), 10); shake = 0.15f;
    if (by_player) input_rumble(5); else input_rumble(10);
  }
  if (by_player) {
    if (!blocked) { combo++; combo_t = 1.2f; }
    fw_add_score((int)(dmg * 5));
    if (combo >= 3) { char t[24]; snprintf(t, sizeof t, "%d hit combo!", combo); fx_popup(clampf(a->x, 90, 550), a->y - 150, t, RGB(255, 235, 120)); }
  } else if (!blocked) combo = 0;
  return true;
}

static void common_physics(Fighter *f, float dt) {
  if (f->air || f->y < FLOOR_Y) { f->vy += 2300 * dt; f->y += f->vy * dt; f->air = true; if (f->y >= FLOOR_Y) { f->y = FLOOR_Y; f->vy = 0; f->air = false; } }
  f->x = clampf(f->x, ARENA_L, ARENA_R);
  f->st += dt;
  if (f->state == S_PUNCH && f->st >= PUNCH.dur) f->state = S_IDLE;
  if (f->state == S_KICK && f->st >= KICK.dur) f->state = S_IDLE;
  if (f->state == S_HURT && f->st >= 0.32f) f->state = S_IDLE;
}

static void update_player(float dt, const Input *in) {
  Fighter *f = &pl;
  f->face = cpu.x >= f->x ? 1 : -1;
  bool free_ = f->state == S_IDLE || f->state == S_WALK;
  f->block = free_ && !f->air && in->one;
  if (free_) {
    float dir = (in->right ? 1.0f : 0.0f) - (in->left ? 1.0f : 0.0f);
    if (f->block) dir = 0;
    f->x += dir * 240 * dt;
    f->state = dir != 0 ? S_WALK : S_IDLE;
    if ((in->up_down || in->two_down) && !f->air) { f->vy = -760; f->air = true; audio_sfx(SFX_FLIP); }
    if (in->a_down) begin_attack(f, S_PUNCH);
    else if (in->b_down) begin_attack(f, S_KICK);
  }
  common_physics(f, dt);
  if (f->state == S_PUNCH) resolve(f, &cpu, &PUNCH, 1.0f, true);
  if (f->state == S_KICK) resolve(f, &cpu, &KICK, 1.0f, true);
}

static void update_cpu(float dt) {
  Fighter *f = &cpu;
  float lv = (float)level / (OPPONENTS - 1);
  f->face = pl.x >= f->x ? 1 : -1;
  ai_t -= dt;
  bool free_ = f->state == S_IDLE || f->state == S_WALK;
  float gap = fabsf(pl.x - f->x);
  if (free_ && !f->air) {
    f->block = f->block && ai_t > 0;                         /* a block lasts until its timer runs out */
    if (!f->block) {
      if (gap > 110) { f->x += f->face * lerpf(130, 215, lv) * dt; f->state = S_WALK; }
      else f->state = S_IDLE;
      if (ai_t <= 0) {
        ai_t = lerpf(0.85f, 0.32f, lv) * frand(0.7f, 1.3f);
        float r = frand(0, 1);
        if (gap <= 110) {
          if (r < 0.45f) begin_attack(f, S_PUNCH);
          else if (r < 0.70f) begin_attack(f, S_KICK);
          else if (r < 0.70f + 0.15f + 0.1f * lv) { f->block = true; ai_t = 0.5f; }
          else f->x -= f->face * 60;                          /* step back */
        } else if (r < 0.1f && !f->air) { f->vy = -720; f->air = true; }
      }
    }
  }
  common_physics(f, dt);
  float scale = lerpf(0.8f, 1.5f, lv);
  if (f->state == S_PUNCH) resolve(f, &pl, &PUNCH, scale, false);
  if (f->state == S_KICK) resolve(f, &pl, &KICK, scale, false);
}

static void update(float dt, const Input *in) {
  if (shake > 0) shake -= dt;
  if (combo_t > 0) { combo_t -= dt; if (combo_t <= 0) combo = 0; }
  if (announce_t > 0) announce_t -= dt;

  if (pl.state == S_KO) return;
  if (cpu.state == S_KO) {
    ko_t -= dt;
    common_physics(&pl, dt);
    if (ko_t <= 0) { level++; pl.hp = fminf(100, pl.hp + 25); pl.state = S_IDLE; spawn_cpu(); }
    return;
  }
  update_player(dt, in);
  update_cpu(dt);

  if (cpu.hp <= 0) {
    cpu.hp = 0; cpu.state = S_KO; cpu.st = 0; defeated++; combo = 0;
    int pts = 300 + level * 100 + (int)pl.hp * 3;
    fw_add_score(pts);
    char t[24]; snprintf(t, sizeof t, "K.O.! +%d", pts);
    fx_popup(clampf(cpu.x, 110, 530), cpu.y - 170, t, RGB(255, 235, 100)); fx_burst(cpu.x, cpu.y - 70, RGB(255, 220, 90), 24);
    audio_sfx(SFX_WIN); shake = 0.35f;
    if (defeated >= OPPONENTS) { fw_add_score(500); fw_finish(true, "Champion of the dojo!"); return; }
    ko_t = 1.6f;
  } else if (pl.hp <= 0) {
    pl.hp = 0; pl.state = S_KO; pl.st = 0; audio_sfx(SFX_LOSE); input_rumble(20);
    fw_finish(false, "Knocked out!");
  }
}

static void draw_fighter(const Fighter *f, Color body, Color trim, bool is_player) {
  float x = f->x + (shake > 0 && f->state == S_HURT ? sinf(shake * 90) * 5 : 0), y = f->y, fc = (float)f->face;
  gfx_ellipse(x, FLOOR_Y + 6, 34, 9, RGBA(0, 0, 0, 90));
  if (f->state == S_KO) {                                   /* lying flat */
    gfx_rrect(x - 50, y - 24, 100, 30, 12, body); gfx_circle(x + 54 * -fc, y - 12, 16, RGB(238, 190, 150));
    gfx_text_center(x, y - 64, 24, RGB(255, 235, 100), "x_x");
    return;
  }
  float lean = f->state == S_HURT ? -fc * 8 : (f->state == S_PUNCH ? fc * 6 : 0);
  float legspread = f->state == S_WALK ? sinf(f->st * 30 + x * 0.1f) * 14 : 0;
  float hy = y - (f->air ? 0 : 0);
  /* legs */
  gfx_line(x - 8, hy - 44, x - 12 - legspread, hy, 12, trim);
  if (f->state == S_KICK) { float p = clampf(f->st / KICK.dur, 0, 1), ext = sinf(p * PI_F) * 74; gfx_line(x + 8, hy - 44, x + fc * (22 + ext), hy - 48 - ext * 0.15f, 12, trim); gfx_circle(x + fc * (26 + ext), hy - 50 - ext * 0.15f, 8, RGB(238, 190, 150)); }
  else gfx_line(x + 8, hy - 44, x + 12 + legspread, hy, 12, trim);
  /* torso and head */
  gfx_rrect(x - 20 + lean, hy - 112, 40, 72, 12, body);
  if (f->block) gfx_rrect(x + fc * 22 - 8, hy - 112, 16, 66, 8, RGBA(170, 210, 255, 220));
  gfx_circle(x + lean * 1.4f, hy - 126, 16, RGB(238, 190, 150));
  gfx_rect(x + lean * 1.4f - 17, hy - 134, 34, 6, is_player ? RGB(235, 60, 60) : RGB(30, 30, 40));
  gfx_circle(x + lean * 1.4f + fc * 6, hy - 126, 2.5f, RGB(20, 20, 20));
  /* arms */
  if (f->state == S_PUNCH) { float p = clampf(f->st / PUNCH.dur, 0, 1), ext = sinf(p * PI_F) * 66; gfx_line(x + fc * 6, hy - 96, x + fc * (26 + ext), hy - 98, 11, RGB(238, 190, 150)); gfx_circle(x + fc * (30 + ext), hy - 98, 10, RGB(235, 235, 240)); }
  else { gfx_line(x + fc * 6, hy - 96, x + fc * 22, hy - 80, 10, RGB(238, 190, 150)); gfx_circle(x + fc * 26, hy - 78, 9, RGB(235, 235, 240)); }
  if (f->state == S_HURT) gfx_text_center(x, hy - 168, 22, RGB(255, 235, 100), "!");
}

static void bar(float x, float w, float hp, float maxhp, Color c, bool right, const char *name) {
  gfx_rect(x - 3, 53, w + 6, 22, RGBA(0, 0, 0, 150));
  float fill = clampf(hp / maxhp, 0, 1) * w;
  gfx_rect(right ? x + w - fill : x, 56, fill, 16, c);
  gfx_text(right ? x + w - gfx_text_width(name, 16) : x + 2, 74, 16, RGB(255, 255, 255), name);
}

static void draw(void) {
  float sx = shake > 0 ? sinf(shake * 70) * 4 : 0;
  gfx_set_origin((g_screen_w - WORLD_W) * 0.5f + sx);
  for (int i = 0; i < 14; i++) { gfx_circle(20 + i * 46, 232 + (i % 3) * 8, 17, RGBA(20, 20, 40, 170)); gfx_rrect(8 + i * 46, 240 + (i % 3) * 8, 26, 40, 8, RGBA(20, 20, 40, 170)); }   /* crowd */
  gfx_rect(0, 288, WORLD_W, 8, RGB(255, 255, 255));
  gfx_rect(0, 296, WORLD_W, 184, RGB(120, 60, 50));
  for (int i = 0; i < 9; i++) gfx_line(i * 80 - 20, 296, i * 100 - 140, 480, 2, RGBA(0, 0, 0, 60));
  gfx_rect(0, FLOOR_Y - 8, WORLD_W, 3, RGBA(0, 0, 0, 40));
  draw_fighter(&cpu, BODY[level < OPPONENTS ? level : OPPONENTS - 1], RGB(50, 50, 70), false);
  draw_fighter(&pl, RGB(70, 130, 235), RGB(35, 60, 130), true);
  bar(16, 232, pl.hp, 100, RGB(90, 220, 110), false, "You");
  bar(392, 232, cpu.hp, 90.0f + 10.0f * level, RGB(235, 90, 90), true, NAMES[level < OPPONENTS ? level : OPPONENTS - 1]);
  char b[32]; snprintf(b, sizeof b, "Fight %d/%d", (level < OPPONENTS ? level : OPPONENTS - 1) + 1, OPPONENTS);
  gfx_text_center(WORLD_W * 0.5f, 56, 20, RGB(255, 235, 120), b);
  if (announce_t > 0) gfx_text_shadow(WORLD_W * 0.5f, 150, 54, RGB(255, 255, 255), announce_t > 0.7f ? "Ready..." : "FIGHT!");
  if (combo >= 2) { snprintf(b, sizeof b, "Combo x%d", combo); gfx_text_center(WORLD_W * 0.5f, 440, 24, RGB(255, 235, 120), b); }
}

static void icon(float cx, float cy, float s) {
  gfx_rrect(cx - s * 0.36f, cy - s * 0.18f, s * 0.2f, s * 0.42f, 6, RGB(70, 130, 235)); gfx_circle(cx - s * 0.26f, cy - s * 0.28f, s * 0.09f, RGB(238, 190, 150));
  gfx_rrect(cx + s * 0.16f, cy - s * 0.18f, s * 0.2f, s * 0.42f, 6, RGB(220, 90, 80)); gfx_circle(cx + s * 0.26f, cy - s * 0.28f, s * 0.09f, RGB(238, 190, 150));
  draw_star(cx, cy - s * 0.04f, s * 0.2f, RGB(255, 225, 80));
}

const GameDef game_fight = {
  "Fist Fury", "Five fighters. One champion.",
  {"Beat five computer fighters, each tougher than the last.", "A punches, B kicks. Hold 1 to block. Up (or 2) jumps.", "Move with the +Control Pad. Combos score more!", "You recover a little health after every win."},
  "Move: +Control Pad   Punch: A   Kick: B   Block: 1   Jump: Up / 2", RGB(80, 50, 120), RGB(160, 60, 90), 120, 0, start, update, draw, icon, CUR_NONE, INP_DPAD | INP_A | INP_B | INP_ONE | INP_TWO, 900, 2500};
