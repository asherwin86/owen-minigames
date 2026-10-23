/* Fishing Frenzy: move the boat, drop the hook, reel in fish. Deeper fish are worth more, boots are junk.
 * A swing of the Wii Remote (or A) drops the hook; hold A while reeling to wind in faster. */
#include "gl.h"
#include "games.h"

#define MAX_FISH 14
typedef struct { float x, y, vx, size; int kind; bool on, caught; } Fish;   /* kind: 0 small, 1 medium, 2 big, 3 golden, 4 boot */
static Fish fish[MAX_FISH];
static float boat_x, hook_x, hook_y, spawn_t, tug;
static int state;                               /* 0 ready on the boat, 1 hook sinking, 2 reeling in */
static int hooked;                              /* index of the fish on the line, or -1 */
#define WATER_Y 150.0f
#define BOTTOM_Y 450.0f

static const int VALUE[5] = {10, 30, 60, 120, -15};
static const Color COLOR[5] = {RGB(255, 170, 60), RGB(90, 200, 230), RGB(180, 100, 230), RGB(255, 215, 60), RGB(120, 90, 60)};

static void start(void) { for (int i = 0; i < MAX_FISH; i++) fish[i].on = false; boat_x = hook_x = WORLD_W / 2; hook_y = WATER_Y; spawn_t = 0; state = 0; hooked = -1; tug = 0; }

static void spawn(void) {
  for (int i = 0; i < MAX_FISH; i++) {
    if (fish[i].on) continue;
    float r = frand(0, 1);
    int kind = r < 0.08f ? 3 : (r < 0.18f ? 4 : (r < 0.50f ? 0 : (r < 0.80f ? 1 : 2)));
    float y = kind == 0 ? frand(190, 270) : (kind == 1 ? frand(260, 360) : (kind == 2 ? frand(350, 440) : frand(230, 430)));
    bool left = chance(0.5f);
    float spd = (kind == 3 ? 170 : frand(55, 110)) * (kind == 0 ? 1.2f : 1.0f);
    float size = kind == 0 ? 18 : (kind == 1 ? 26 : (kind == 2 ? 36 : 22));
    fish[i] = (Fish){left ? -50 : WORLD_W + 50, y, left ? spd : -spd, size, kind, true, false};
    return;
  }
}

static void update(float dt, const Input *in) {
  float tx = boat_x;
  if (in->ir_valid) tx = in->x; else if (in->left) tx = boat_x - 400 * dt; else if (in->right) tx = boat_x + 400 * dt;
  if (state == 0) boat_x = clampf(lerpf(boat_x, tx, in->ir_valid ? 0.25f : 1.0f), 40, WORLD_W - 40);
  else boat_x = clampf(lerpf(boat_x, tx, 0.04f), 40, WORLD_W - 40);          /* the boat drifts only slowly while fishing */
  if (state == 0) { hook_x = boat_x; hook_y = WATER_Y; }

  spawn_t -= dt;
  if (spawn_t <= 0) { spawn(); spawn_t = frand(0.5f, 1.1f); }
  for (int i = 0; i < MAX_FISH; i++) {
    Fish *f = &fish[i];
    if (!f->on) continue;
    if (f->caught) { f->x = hook_x; f->y = hook_y + 16; continue; }
    f->x += f->vx * dt;
    if (f->x < -80 || f->x > WORLD_W + 80) f->on = false;
  }

  if (state == 0 && (in->a_down || in->flick)) { state = 1; audio_sfx(SFX_SPLASH); }
  if (state == 1) {
    hook_y += 300 * dt;
    for (int i = 0; i < MAX_FISH && hooked < 0; i++) {
      Fish *f = &fish[i];
      if (f->on && !f->caught && in_circle(hook_x, hook_y, f->x, f->y, f->size + 8)) { hooked = i; f->caught = true; state = 2; audio_sfx(f->kind == 4 ? SFX_MISS : SFX_HIT); input_rumble(8); }
    }
    if (hook_y >= BOTTOM_Y) state = 2;
  } else if (state == 2) {
    float reel = (in->a || in->two_down) ? 460 : 280;
    if (hooked >= 0 && fish[hooked].kind == 2) reel *= 0.8f;                 /* big fish pull back */
    hook_y -= reel * dt;
    tug += dt;
    if (hook_y <= WATER_Y) {
      hook_y = WATER_Y; state = 0;
      if (hooked >= 0) {
        Fish *f = &fish[hooked];
        int v = VALUE[f->kind];
        fw_add_score(v);
        char t[16]; snprintf(t, sizeof t, "%+d", v);
        fx_popup(hook_x - 14, WATER_Y - 50, t, v > 0 ? RGB(255, 255, 255) : RGB(255, 110, 110));
        if (v > 0) { fx_burst(hook_x, WATER_Y, COLOR[f->kind], 12); audio_sfx(f->kind == 3 ? SFX_WIN : SFX_GOOD); } else audio_sfx(SFX_BAD);
        f->on = false; hooked = -1;
      }
    }
  }
}

static void draw_fish(const Fish *f) {
  float dir = f->vx >= 0 ? 1 : -1;
  if (f->kind == 4) { gfx_quad(f->x - 12, f->y - 16, f->x + 4, f->y - 16, f->x + 4, f->y + 8, f->x - 12, f->y + 8, COLOR[4]); gfx_quad(f->x - 12, f->y + 2, f->x + 22, f->y + 8, f->x + 22, f->y + 18, f->x - 12, f->y + 18, RGB(90, 65, 40)); return; }
  gfx_ellipse(f->x, f->y, f->size * 1.25f, f->size * 0.75f, COLOR[f->kind]);
  gfx_tri(f->x - dir * f->size * 1.1f, f->y, f->x - dir * f->size * 1.9f, f->y - f->size * 0.7f, f->x - dir * f->size * 1.9f, f->y + f->size * 0.7f, COLOR[f->kind]);
  gfx_circle(f->x + dir * f->size * 0.6f, f->y - f->size * 0.15f, f->size * 0.16f, RGB(255, 255, 255));
  gfx_circle(f->x + dir * f->size * 0.65f, f->y - f->size * 0.15f, f->size * 0.08f, RGB(20, 20, 20));
  if (f->kind == 3) draw_star(f->x, f->y - f->size, 8, RGB(255, 255, 160));
}

static void draw(void) {
  gfx_rect_grad(0, WATER_Y, WORLD_W, WORLD_H - WATER_Y, RGB(50, 150, 215), RGB(15, 50, 120));
  for (int i = 0; i < 14; i++) gfx_ellipse(fmodf(i * 61.0f + R.elapsed * 14, WORLD_W + 40) - 20, WATER_Y + 3 + sinf(R.elapsed * 2 + i) * 2, 22, 4, RGBA(255, 255, 255, 120));
  for (int i = 0; i < 8; i++) gfx_ellipse(40 + i * 82, BOTTOM_Y + 36, 60, 22, RGB(150, 130, 90));
  for (int i = 0; i < MAX_FISH; i++) if (fish[i].on) draw_fish(&fish[i]);
  float by = WATER_Y - 6 + sinf(R.elapsed * 2.5f) * 3;
  gfx_quad(boat_x - 50, by - 22, boat_x + 50, by - 22, boat_x + 36, by + 8, boat_x - 36, by + 8, RGB(190, 90, 50));
  gfx_rect(boat_x - 4, by - 56, 6, 36, RGB(110, 80, 50));
  gfx_tri(boat_x + 2, by - 56, boat_x + 38, by - 34, boat_x + 2, by - 30, RGB(255, 255, 255));
  gfx_line(boat_x + 20, by - 18, hook_x, hook_y, 2, RGBA(255, 255, 255, 200));
  gfx_ring(hook_x, hook_y + 6, 4, 7, RGB(220, 220, 230));
  if (state == 0) gfx_text_center(boat_x, by - 86, 20, RGB(255, 255, 255), "A: drop the hook");
  else if (state == 2) gfx_text_center(WORLD_W * 0.5f, 56, 22, RGB(255, 255, 255), "Hold A to reel in faster!");
}

static void icon(float cx, float cy, float s) {
  gfx_rect(cx - s * 0.5f, cy - s * 0.05f, s, s * 0.55f, RGB(40, 130, 200));
  gfx_ellipse(cx, cy + s * 0.22f, s * 0.2f, s * 0.12f, RGB(255, 170, 60));
  gfx_tri(cx - s * 0.18f, cy + s * 0.22f, cx - s * 0.34f, cy + s * 0.1f, cx - s * 0.34f, cy + s * 0.34f, RGB(255, 170, 60));
  gfx_line(cx + s * 0.2f, cy - s * 0.4f, cx + s * 0.2f, cy + s * 0.12f, 2, RGB(255, 255, 255));
}

const GameDef game_fishing = {
  "Fishing Frenzy", "What will you catch?",
  {"Move the boat, then press A (or swing the remote) to drop the hook.", "Hook a fish, then wind it in. Hold A to reel faster.", "Deep fish and golden fish score big. Old boots cost points!", NULL},
  "Move: point at the screen   Hook: A", RGB(120, 200, 245), RGB(40, 120, 190), 60, 0, start, update, draw, icon, CUR_NONE, INP_POINT | INP_A | INP_SWING, 300, 600};
