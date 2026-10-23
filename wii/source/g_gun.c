/* Outlaw Shootout: a Wild West shooting gallery. Bandits pop up from windows and behind barrels and fire at you if you are
 * too slow; townsfolk pop up too and must not be shot. Press B (the trigger) or A to fire; you have six bullets, then
 * reload by pressing 1, swinging the remote, or just pulling the trigger on an empty gun. */
#include "gl.h"
#include "games.h"

#define SLOTS 6
#define MAG 6
typedef struct { int kind; float t, dur, gone_t; bool fired; } Slot;          /* kind: 0 empty, 1 bandit, 2 townsperson */
static Slot slots[SLOTS];
static int ammo, hits, shots;
static float reload_t, spawn_t, muzzle, hurt, msg_t, last_x, last_y;
static const char *msg;
static const float SX[3] = {120, 320, 520};
static const float SY[2] = {262, 410};                 /* where the cover's top edge is: a figure's feet stand here */

static void slot_pos(int i, float *x, float *y) { *x = SX[i % 3]; *y = SY[i / 3]; }

static void start(void) {
  for (int i = 0; i < SLOTS; i++) slots[i] = (Slot){0, 0, 0, 0, false};
  ammo = MAG; hits = shots = 0; reload_t = 0; spawn_t = 0.7f; muzzle = hurt = msg_t = 0; msg = ""; last_x = 320; last_y = 240;
}

static int busy(void) { int n = 0; for (int i = 0; i < SLOTS; i++) if (slots[i].kind) n++; return n; }

static void say(const char *m) { msg = m; msg_t = 0.9f; }

static void update(float dt, const Input *in) {
  float diff = clampf(R.elapsed / 60.0f, 0, 1);
  last_x = in->x; last_y = in->y;
  if (muzzle > 0) muzzle -= dt;
  if (hurt > 0) hurt -= dt;
  if (msg_t > 0) msg_t -= dt;

  spawn_t -= dt;
  if (spawn_t <= 0) {
    int free_idx[SLOTS], nf = 0;
    for (int i = 0; i < SLOTS; i++) if (!slots[i].kind && slots[i].gone_t <= 0) free_idx[nf++] = i;
    if (nf > 0 && busy() < 1 + (int)(diff * 2.4f)) {
      int i = free_idx[irand(nf)];
      slots[i] = (Slot){chance(0.22f) ? 2 : 1, 0, lerpf(1.9f, 0.95f, diff) * frand(0.9f, 1.15f), 0, false};
    }
    spawn_t = frand(lerpf(0.9f, 0.45f, diff), lerpf(1.3f, 0.75f, diff));
  }
  for (int i = 0; i < SLOTS; i++) {
    Slot *s = &slots[i];
    if (s->gone_t > 0) s->gone_t -= dt;
    if (!s->kind) continue;
    s->t += dt;
    float x, y; slot_pos(i, &x, &y);
    if (s->kind == 1 && s->t >= s->dur && !s->fired) {                  /* the bandit gets a shot off at you */
      s->fired = true; hurt = 0.4f; audio_sfx(SFX_BAD); input_rumble(14);
      fx_burst(x, y - 60, RGB(255, 200, 80), 10); say("Ouch!"); fw_lose_life();
    }
    if (s->t >= s->dur + (s->kind == 1 ? 0.45f : 0.2f)) { s->kind = 0; s->gone_t = 0.4f; }
  }

  if (reload_t > 0) { reload_t -= dt; if (reload_t <= 0) { ammo = MAG; audio_sfx(SFX_FLIP); } }
  else if ((in->one_down || in->flick || in->minus_down) && ammo < MAG) { reload_t = 0.8f; audio_sfx(SFX_FLIP); say("Reloading..."); }

  if ((in->a_down || in->b_down) && reload_t <= 0) {
    if (ammo <= 0) { reload_t = 0.8f; audio_sfx(SFX_CLICK); say("Reloading..."); return; }
    ammo--; shots++; muzzle = 0.08f; audio_sfx(SFX_HIT); input_rumble(4);
    bool got = false;
    for (int order = SLOTS - 1; order >= 0 && !got; order--) {          /* the front row (lower on screen) is checked first */
      Slot *s = &slots[order];
      if (!s->kind || (s->kind == 1 && s->fired && s->t > s->dur + 0.3f)) continue;
      float x, y; slot_pos(order, &x, &y);
      float rise = clampf(s->t / 0.15f, 0, 1), dy = (1 - rise) * 80;
      bool head = in_circle(in->x, in->y, x, y - 84 + dy, 19);
      bool body = in_rect(in->x, in->y, x - 26, y - 66 + dy, 52, 66);
      if (!head && !body) continue;
      got = true; hits++;
      if (s->kind == 2) {
        fw_add_score(-50); fx_popup(x, y - 112, "Oops!", RGB(255, 120, 120)); audio_sfx(SFX_MISS); say("Don't shoot townsfolk!");
        fw_lose_life();
      } else {
        int pts = (head ? 150 : 100) + (int)(50.0f * clampf(1.0f - s->t / s->dur, 0, 1));
        fw_add_score(pts);
        char t[24]; snprintf(t, sizeof t, "%s%d", head ? "HEAD " : "+", pts);
        fx_popup(x, y - 118, t, head ? RGB(255, 230, 80) : RGB(255, 255, 255));
        fx_burst(x, y - 60, RGB(230, 170, 90), 10); audio_sfx(head ? SFX_WIN : SFX_GOOD);
      }
      s->kind = 0; s->gone_t = 0.5f;
    }
    if (ammo == 0 && reload_t <= 0) say("Out of bullets! Press 1 or fire to reload");
  }
}

static void draw_person(float x, float y, float rise, bool bandit, bool shooting) {
  float dy = (1 - rise) * 90;
  float by = y + dy;                                                      /* feet */
  Color shirt = bandit ? RGB(150, 55, 50) : RGB(60, 110, 190), hat = bandit ? RGB(45, 35, 30) : RGB(245, 240, 225);
  gfx_rrect(x - 22, by - 66, 44, 56, 10, shirt);
  gfx_circle(x, by - 84, 17, RGB(238, 190, 150));
  gfx_ellipse(x, by - 98, 28, 7, hat); gfx_rrect(x - 15, by - 116, 30, 20, 6, hat);
  if (bandit) { gfx_rect(x - 17, by - 84, 34, 8, RGB(190, 40, 40)); gfx_circle(x - 6, by - 88, 2.5f, RGB(20, 20, 20)); gfx_circle(x + 6, by - 88, 2.5f, RGB(20, 20, 20)); }
  else { gfx_circle(x - 6, by - 86, 2.5f, RGB(20, 20, 20)); gfx_circle(x + 6, by - 86, 2.5f, RGB(20, 20, 20)); gfx_rect(x - 5, by - 76, 10, 2.5f, RGB(150, 60, 60)); }
  if (bandit) {
    gfx_line(x + 14, by - 50, x + 40, by - 62, 7, shirt);
    gfx_rect(x + 36, by - 70, 18, 8, RGB(70, 70, 80));
    if (shooting) { draw_star(x + 62, by - 66, 16, RGB(255, 220, 90)); }
  }
}

static void draw(void) {
  gfx_rect(0, 50, WORLD_W, 100, RGBA(255, 190, 120, 70));                  /* sunset glow behind the town */
  gfx_circle(500, 120, 40, RGBA(255, 230, 150, 160));
  gfx_rect(0, 114, WORLD_W, 226, RGB(150, 100, 60));                      /* saloon front */
  for (int k = 0; k < 9; k++) gfx_rect(0, 114 + k * 25, WORLD_W, 2, RGBA(0, 0, 0, 50));
  gfx_rect(0, 74, WORLD_W, 38, RGB(110, 70, 40));
  gfx_text_center(WORLD_W * 0.5f, 72, 32, RGB(250, 220, 140), "SALOON");
  gfx_rect(0, 340, WORLD_W, 140, RGB(222, 180, 120));                     /* dusty street */
  for (int i = 0; i < SLOTS; i++) {
    float x, y; slot_pos(i, &x, &y);
    if (i < 3) { gfx_rect(x - 44, y - 92, 88, 92, RGB(30, 22, 18)); }      /* window opening */
    const Slot *s = &slots[i];
    if (s->kind) draw_person(x, y, clampf(s->t / 0.15f, 0, 1), s->kind == 1, s->kind == 1 && s->fired);
    if (i < 3) { gfx_rect(x - 54, y - 4, 108, 16, RGB(95, 60, 35)); gfx_rect(x - 50, y - 100, 6, 100, RGB(95, 60, 35)); gfx_rect(x + 44, y - 100, 6, 100, RGB(95, 60, 35)); }
    else { gfx_rrect(x - 46, y, 92, 70, 8, RGB(120, 78, 42)); gfx_rect(x - 46, y + 18, 92, 6, RGB(70, 45, 25)); gfx_rect(x - 46, y + 46, 92, 6, RGB(70, 45, 25)); }
  }
  if (muzzle > 0) { gfx_circle(last_x, last_y, 18, RGBA(255, 240, 160, 150)); gfx_tri(WORLD_W * 0.5f - 24, WORLD_H, WORLD_W * 0.5f + 24, WORLD_H, last_x, last_y, RGBA(255, 240, 180, 60)); }
  if (hurt > 0) gfx_rect(0, 50, WORLD_W, 430, RGBA(255, 0, 0, (int)(110 * hurt / 0.4f)));
  for (int k = 0; k < MAG; k++) { Color c = k < ammo ? RGB(255, 215, 80) : RGBA(255, 255, 255, 60); gfx_rrect(16 + k * 20, 446, 12, 26, 3, c); }
  if (reload_t > 0) { gfx_rect(16, 476, 120, 4, RGBA(255, 255, 255, 80)); gfx_rect(16, 476, 120 * (1 - reload_t / 0.8f), 4, RGB(255, 215, 80)); }
  if (msg_t > 0) gfx_text_shadow(WORLD_W * 0.5f, 352, 26, RGB(80, 40, 20), msg);
  char b[32]; snprintf(b, sizeof b, "Hits %d/%d", hits, shots);
  gfx_text(WORLD_W - 150, 450, 20, RGB(255, 255, 255), b);
}

static void icon(float cx, float cy, float s) {
  gfx_rrect(cx - s * 0.2f, cy - s * 0.02f, s * 0.4f, s * 0.34f, 6, RGB(150, 100, 60));
  gfx_circle(cx, cy - s * 0.12f, s * 0.14f, RGB(238, 190, 150));
  gfx_ellipse(cx, cy - s * 0.22f, s * 0.24f, s * 0.05f, RGB(45, 35, 30)); gfx_rrect(cx - s * 0.1f, cy - s * 0.38f, s * 0.2f, s * 0.15f, 4, RGB(45, 35, 30));
  gfx_ring(cx + s * 0.28f, cy + s * 0.22f, s * 0.07f, s * 0.1f, RGB(255, 255, 255)); gfx_rect(cx + s * 0.26f, cy + s * 0.12f, s * 0.04f, s * 0.2f, RGB(255, 255, 255));
}

const GameDef game_gun = {
  "Outlaw Shootout", "Be the fastest gun in town!",
  {"Bandits pop up in the windows and behind the barrels.", "Shoot them before they shoot you! Headshots score extra.", "Don't shoot the townsfolk in white hats.", "Six bullets: press 1 or swing the remote to reload."},
  "Aim: point at the screen   Fire: B or A   Reload: 1", RGB(255, 170, 90), RGB(190, 100, 60), 60, 3, start, update, draw, icon, CUR_CROSSHAIR, INP_POINT | INP_A | INP_B | INP_ONE | INP_SWING, 600, 1200};
