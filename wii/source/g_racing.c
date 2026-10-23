/* Racing Challenge: a road race against the clock. Dodge cars and cones, grab coins, and drive through
 * checkpoints for extra time. The road is drawn pseudo-3D (one strip per few screen rows), so there is no 3D
 * model data at all. Steering: +Control Pad, else tilt the remote, else point left or right. */
#include "gl.h"
#include "games.h"

#define HORIZON 170.0f
#define ROWS_STEP 4.0f
#define K_DEPTH 36.0f
#define VIEW 900.0f
#define MAX_O 24
#define MAX_SPEED 560.0f
typedef struct { float z, lane; int kind; bool on; } Obj;      /* 0 coin, 1 car, 2 cone */
static Obj os[MAX_O];
static float z, v, px, next_spawn, next_check, shake, slow_msg;
static int coins;
static float check_msg;

static float curv(float zz) { return 0.55f * sinf(zz * 0.00045f) + 0.35f * sinf(zz * 0.0011f + 1.3f); }
static float half_w(float t) { return 14.0f + t * 330.0f; }
static float row_t(float dz) { return clampf(K_DEPTH / dz - 0.04f, 0, 1.2f); }

static void start(void) {
  for (int i = 0; i < MAX_O; i++) os[i].on = false;
  z = 0; v = 160; px = 0; next_spawn = 500; next_check = 2400; shake = 0; coins = 0; check_msg = slow_msg = 0;
}

static void add_obj(float oz, float lane, int kind) {
  for (int i = 0; i < MAX_O; i++) if (!os[i].on) { os[i] = (Obj){oz, lane, kind, true}; return; }
}

static void hurt(float cut, float secs, const char *msg) {
  v *= cut; R.time_left -= secs; shake = 0.4f; slow_msg = 0.9f;
  audio_sfx(SFX_BAD); input_rumble(14); (void)msg;
}

static void update(float dt, const Input *in) {
  float steer = 0;
  if (in->left || in->right) steer = (in->right ? 1.0f : 0.0f) - (in->left ? 1.0f : 0.0f);
  else if (fabsf(in->tilt) > 0.12f) steer = in->tilt;
  else if (in->ir_valid) steer = clampf((in->x - WORLD_W * 0.5f) / 180.0f, -1, 1);
  bool gas = in->a || in->two, brake = in->b || in->one;
  if (gas) v += 260 * dt; else v -= 90 * dt;
  if (brake) v -= 520 * dt;
  bool off = fabsf(px) > 1.02f;
  float vmax = off ? 170.0f : MAX_SPEED;
  if (v > vmax) v -= 700 * dt * (off ? 1.0f : 0.2f);
  v = clampf(v, 60, MAX_SPEED);
  float sp = v / MAX_SPEED;
  px += steer * (0.4f + 1.0f * sp) * 1.15f * dt;
  px -= curv(z + 250) * sp * sp * 1.35f * dt;                 /* corners push the car wide */
  px = clampf(px, -1.35f, 1.35f);
  z += v * dt;
  fw_add_score(0);
  static float acc; acc += v * dt / 25.0f; while (acc >= 1) { fw_add_score(1); acc -= 1; }
  if (shake > 0) shake -= dt;
  if (slow_msg > 0) slow_msg -= dt;
  if (check_msg > 0) check_msg -= dt;
  if (off && sp > 0.3f && ((int)(R.elapsed * 12) & 3) == 0) input_rumble(2);

  while (z + VIEW > next_spawn) {
    float lane = frand(-0.8f, 0.8f); float r = frand(0, 1);
    if (r < 0.45f) { int n = 3 + irand(3); for (int k = 0; k < n; k++) add_obj(next_spawn + k * 70.0f, lane, 0); }
    else if (r < 0.80f) add_obj(next_spawn, lane, 1);
    else add_obj(next_spawn, lane, 2);
    next_spawn += frand(170, 330);
  }
  for (int i = 0; i < MAX_O; i++) {
    Obj *o = &os[i];
    if (!o->on) continue;
    float dz = o->z - z;
    if (dz < -10) { o->on = false; continue; }
    if (dz < 46 && dz > 14 && fabsf(o->lane - px) < 0.26f) {
      o->on = false;
      if (o->kind == 0) { coins++; fw_add_score(20); audio_sfx(SFX_GOOD); fx_burst(WORLD_W * 0.5f, 400, RGB(255, 225, 70), 8); }
      else if (o->kind == 1) hurt(0.25f, 2.5f, "Crash!");
      else hurt(0.6f, 1.0f, "Bump!");
    }
  }
  if (z >= next_check) { next_check += 2400; R.time_left += 8; fw_add_score(100); check_msg = 1.6f; audio_sfx(SFX_WIN); }
}

static void draw_obj(const Obj *o) {
  float dz = o->z - z;
  if (dz < 30 || dz > VIEW) return;
  float t = row_t(dz), y = HORIZON + t * (WORLD_H - HORIZON);
  float k = curv(z + 250), cx = WORLD_W * 0.5f + k * sqf(1 - t) * 260 - px * half_w(t);
  float x = cx + o->lane * half_w(t), s = 0.12f + t * 0.95f;
  if (o->kind == 0) { gfx_circle(x, y - 20 * s, 15 * s, RGB(255, 215, 60)); gfx_circle(x, y - 20 * s, 9 * s, RGB(255, 240, 150)); }
  else if (o->kind == 1) {
    gfx_rrect(x - 34 * s, y - 40 * s, 68 * s, 40 * s, 6 * s, RGB(60, 110, 235));
    gfx_rect(x - 22 * s, y - 56 * s, 44 * s, 20 * s, RGB(200, 225, 255));
    gfx_circle(x - 22 * s, y - 2 * s, 9 * s, RGB(25, 25, 30)); gfx_circle(x + 22 * s, y - 2 * s, 9 * s, RGB(25, 25, 30));
  } else { gfx_tri(x, y - 42 * s, x + 17 * s, y, x - 17 * s, y, RGB(255, 130, 30)); gfx_rect(x - 9 * s, y - 24 * s, 18 * s, 6 * s, RGB(255, 255, 255)); }
}

static void draw(void) {
  gfx_rect_grad(0, 50, WORLD_W, HORIZON - 50, RGB(110, 190, 255), RGB(210, 235, 255));
  float k0 = curv(z + 250);
  gfx_tri(60 - k0 * 40, HORIZON, 190 - k0 * 40, 100, 320 - k0 * 40, HORIZON, RGB(120, 150, 190));
  gfx_tri(250 - k0 * 60, HORIZON, 430 - k0 * 60, 84, 600 - k0 * 60, HORIZON, RGB(100, 130, 175));
  float sx = shake > 0 ? sinf(shake * 80) * 5 : 0;
  gfx_rect(0, HORIZON, WORLD_W, WORLD_H - HORIZON, RGB(70, 160, 70));
  for (float y = HORIZON; y < WORLD_H; y += ROWS_STEP) {
    float t = (y - HORIZON) / (WORLD_H - HORIZON), tm = (y + ROWS_STEP * 0.5f - HORIZON) / (WORLD_H - HORIZON);
    float dz = K_DEPTH / (tm + 0.04f), wz = z + dz;
    bool stripe = ((int)(wz / 70.0f)) & 1;
    float cx = WORLD_W * 0.5f + k0 * sqf(1 - t) * 260 - px * half_w(t) + sx, hw = half_w(t);
    gfx_rect(0, y, WORLD_W, ROWS_STEP + 0.5f, stripe ? RGB(66, 152, 66) : RGB(78, 170, 78));
    gfx_rect(cx - hw * 1.12f, y, hw * 2.24f, ROWS_STEP + 0.5f, stripe ? RGB(235, 235, 235) : RGB(220, 60, 60));
    gfx_rect(cx - hw, y, hw * 2, ROWS_STEP + 0.5f, stripe ? RGB(105, 105, 115) : RGB(98, 98, 108));
    if (stripe) { gfx_rect(cx - hw * 0.34f - 1.5f * t, y, 3 * t + 1, ROWS_STEP + 0.5f, RGB(240, 240, 240)); gfx_rect(cx + hw * 0.34f - 1.5f * t, y, 3 * t + 1, ROWS_STEP + 0.5f, RGB(240, 240, 240)); }
  }
  if (next_check - z < VIEW && next_check - z > 30) {          /* checkpoint arch */
    float t = row_t(next_check - z), y = HORIZON + t * (WORLD_H - HORIZON), cx = WORLD_W * 0.5f + k0 * sqf(1 - t) * 260 - px * half_w(t), hw = half_w(t);
    gfx_rect(cx - hw * 1.1f - 4, y - 80 * (0.2f + t), 8 + 6 * t, 80 * (0.2f + t), RGB(240, 240, 240)); gfx_rect(cx + hw * 1.1f - 4, y - 80 * (0.2f + t), 8 + 6 * t, 80 * (0.2f + t), RGB(240, 240, 240));
    gfx_rect(cx - hw * 1.1f, y - 80 * (0.2f + t), hw * 2.2f, 18 * (0.3f + t), RGB(255, 210, 50));
  }
  Obj *order[MAX_O]; int n = 0;
  for (int i = 0; i < MAX_O; i++) if (os[i].on) order[n++] = &os[i];
  for (int a = 1; a < n; a++) { Obj *x = order[a]; int b = a - 1; while (b >= 0 && order[b]->z < x->z) { order[b + 1] = order[b]; b--; } order[b + 1] = x; }
  for (int i = 0; i < n; i++) draw_obj(order[i]);
  float cx = WORLD_W * 0.5f + sx, cy = 440;                    /* the player's car */
  gfx_ellipse(cx, cy + 36, 56, 12, RGBA(0, 0, 0, 90));
  gfx_rrect(cx - 50, cy - 16, 100, 50, 10, RGB(235, 60, 60));
  gfx_rect(cx - 32, cy - 40, 64, 30, RGB(255, 210, 210));
  gfx_rect(cx - 26, cy - 36, 52, 22, RGB(90, 130, 190));
  gfx_rrect(cx - 60, cy + 8, 24, 30, 5, RGB(30, 30, 35)); gfx_rrect(cx + 36, cy + 8, 24, 30, 5, RGB(30, 30, 35));
  if (v > 300 && ((int)(R.elapsed * 20) & 1)) gfx_tri(cx - 10, cy + 34, cx + 10, cy + 34, cx, cy + 52, RGB(255, 170, 60));
  char b[48]; snprintf(b, sizeof b, "%d km/h   Coins %d", (int)(v * 0.4f), coins);
  gfx_text(16, 452, 20, RGB(255, 255, 255), b);
  gfx_rect(WORLD_W - 156, 456, 140, 10, RGBA(255, 255, 255, 70)); gfx_rect(WORLD_W - 156, 456, 140 * (v / MAX_SPEED), 10, RGB(120, 230, 255));
  if (check_msg > 0) gfx_text_shadow(WORLD_W * 0.5f, 120, 44, RGB(255, 230, 90), "Checkpoint! +8 seconds");
  if (slow_msg > 0) gfx_text_shadow(WORLD_W * 0.5f, 90, 34, RGB(255, 120, 120), "Ouch!");
}

static void icon(float cx, float cy, float s) {
  gfx_quad(cx - s * 0.08f, cy - s * 0.4f, cx + s * 0.08f, cy - s * 0.4f, cx + s * 0.44f, cy + s * 0.4f, cx - s * 0.44f, cy + s * 0.4f, RGB(100, 100, 110));
  gfx_rrect(cx - s * 0.17f, cy + s * 0.05f, s * 0.34f, s * 0.22f, 4, RGB(235, 60, 60));
  gfx_rect(cx - s * 0.1f, cy - s * 0.04f, s * 0.2f, s * 0.12f, RGB(90, 130, 190));
}

const GameDef game_racing = {
  "Racing Challenge", "Beat the clock!",
  {"Hold A (or 2) to speed up, and B (or 1) to brake.", "Steer with the +Control Pad, by tilting, or by pointing.", "Grab coins and drive through checkpoints for more time.", "Hitting a car or a cone slows you down and costs time."},
  "Gas: A or 2   Brake: B or 1   Steer: pad / tilt / point", RGB(110, 190, 255), RGB(70, 160, 70), 40, 0, start, update, draw, icon, CUR_NONE, INP_A | INP_B | INP_ONE | INP_TWO | INP_DPAD | INP_TILT, 700, 1300};
