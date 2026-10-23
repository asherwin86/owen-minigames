/* Memory Match: flip two cards at a time and find all eight pairs before the clock runs out. Based on
 * js/games/memory-match.js (4x4 grid, 8 pairs), with a time limit and a bonus for finishing early. */
#include "gl.h"
#include "games.h"

#define GRID 16
#define CARD 88.0f
#define STEP 98.0f
#define X0 124.0f
#define Y0 66.0f
typedef struct { int sym; bool up, matched; float flip; } Card;
static Card cards[GRID];
static int first, second, pairs, moves;
static float wait_t;
static bool done;

static const Color SYM_COL[8] = {RGB(235, 70, 80), RGB(70, 140, 235), RGB(250, 190, 50), RGB(70, 200, 120), RGB(180, 100, 230), RGB(255, 130, 50), RGB(60, 200, 210), RGB(240, 120, 180)};

static void start(void) {
  int deck[GRID];
  for (int i = 0; i < GRID; i++) deck[i] = i / 2;
  for (int i = GRID - 1; i > 0; i--) { int j = irand(i + 1), t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
  for (int i = 0; i < GRID; i++) cards[i] = (Card){deck[i], false, false, 0};
  first = second = -1; pairs = moves = 0; wait_t = 0; done = false;
}

static int card_at(float x, float y) {
  for (int i = 0; i < GRID; i++) if (in_rect(x, y, X0 + (i % 4) * STEP, Y0 + (i / 4) * STEP, CARD, CARD)) return i;
  return -1;
}

static void update(float dt, const Input *in) {
  for (int i = 0; i < GRID; i++) { float target = (cards[i].up || cards[i].matched) ? 1.0f : 0.0f; cards[i].flip += (target - cards[i].flip) * clampf(dt * 14, 0, 1); }
  if (done) return;
  if (wait_t > 0) {
    wait_t -= dt;
    if (wait_t <= 0) { cards[first].up = cards[second].up = false; first = second = -1; }
    return;
  }
  if (!in->a_down) return;
  int c = card_at(in->x, in->y);
  if (c < 0 || cards[c].up || cards[c].matched) return;
  cards[c].up = true;
  audio_sfx(SFX_FLIP);
  if (first < 0) { first = c; return; }
  second = c; moves++;
  float cx = X0 + (c % 4) * STEP + CARD / 2, cy = Y0 + (c / 4) * STEP + CARD / 2;
  if (cards[first].sym == cards[second].sym) {
    cards[first].matched = cards[second].matched = true;
    cards[first].up = cards[second].up = false;
    first = second = -1; pairs++;
    fw_add_score(100);
    fx_burst(cx, cy, SYM_COL[cards[c].sym], 16); fx_popup(cx - 20, cy - 40, "+100", RGB(255, 255, 255));
    audio_sfx(SFX_GOOD);
    if (pairs == 8) {
      done = true;
      int bonus = (int)(R.time_left * 5);
      fw_add_score(bonus);
      fw_finish(true, "All pairs found!");
    }
  } else {
    fw_add_score(-5);
    wait_t = 0.9f;
    audio_sfx(SFX_MISS);
  }
}

static void draw_symbol(int s, float cx, float cy, float r, Color c) {
  switch (s) {
    case 0: gfx_circle(cx, cy, r, c); break;
    case 1: gfx_rrect(cx - r, cy - r, r * 2, r * 2, 6, c); break;
    case 2: gfx_tri(cx, cy - r, cx + r * 1.1f, cy + r * 0.9f, cx - r * 1.1f, cy + r * 0.9f, c); break;
    case 3: draw_star(cx, cy, r * 1.15f, c); break;
    case 4: gfx_quad(cx, cy - r * 1.2f, cx + r, cy, cx, cy + r * 1.2f, cx - r, cy, c); break;
    case 5: draw_heart_shape(cx, cy, r * 2.1f, c); break;
    case 6: gfx_ring(cx, cy, r * 0.55f, r, c); gfx_circle(cx, cy, r * 0.25f, c); break;
    default: gfx_rect(cx - r * 0.35f, cy - r, r * 0.7f, r * 2, c); gfx_rect(cx - r, cy - r * 0.35f, r * 2, r * 0.7f, c); break;
  }
}

static void draw(void) {
  for (int i = 0; i < GRID; i++) {
    float x = X0 + (i % 4) * STEP, y = Y0 + (i / 4) * STEP;
    const Card *c = &cards[i];
    float f = c->flip, sx = fabsf(cosf(f * PI_F));            /* squash horizontally to fake a flip */
    float w = CARD * (sx < 0.06f ? 0.06f : sx), cx = x + CARD / 2;
    bool face = f > 0.5f;
    gfx_rrect(cx - w / 2 - 3, y - 3, w + 6, CARD + 6, 12, c->matched ? RGB(120, 255, 160) : RGBA(0, 0, 0, 120));
    gfx_rrect(cx - w / 2, y, w, CARD, 10, face ? RGB(255, 255, 255) : RGB(70, 90, 190));
    if (face) { if (sx > 0.5f) draw_symbol(c->sym, cx, y + CARD / 2, 26 * sx, SYM_COL[c->sym]); }
    else if (sx > 0.5f) { gfx_text_center(cx, y + 18, 44 * sx, RGB(200, 215, 255), "?"); }
  }
  char b[40]; snprintf(b, sizeof b, "Pairs %d/8   Moves %d", pairs, moves);
  gfx_text_center(WORLD_W * 0.5f, 456, 20, RGB(255, 255, 255), b);
}

static void icon(float cx, float cy, float s) {
  gfx_rrect(cx - s * 0.4f, cy - s * 0.32f, s * 0.36f, s * 0.54f, 6, RGB(70, 90, 190));
  gfx_rrect(cx + s * 0.04f, cy - s * 0.26f, s * 0.36f, s * 0.54f, 6, RGB(255, 255, 255));
  draw_star(cx + s * 0.22f, cy + s * 0.01f, s * 0.14f, RGB(250, 190, 50));
}

const GameDef game_memory = {
  "Memory Match", "Remember where they are!",
  {"Point at a card and press A to flip it over.", "Flip two cards that show the same picture to keep them.", "Find all 8 pairs before time runs out.", NULL},
  "Pick: point at the screen   Flip: A", RGB(110, 80, 190), RGB(60, 50, 140), 75, 0, start, update, draw, icon, CUR_HAND, INP_POINT | INP_A, 900, 1300};
