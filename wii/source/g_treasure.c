/* Treasure Hunt: five treasures are buried under 24 bushes. Move the shovel around: the glow around it turns from
 * blue (cold) to red (hot) as you get closer to treasure, and the Wii Remote buzzes when you are very close.
 * Digging costs 1.5 seconds, so dig carefully. */
#include "gl.h"
#include "games.h"

#define NC 6
#define NR 4
#define CELL 100.0f
#define GX0 20.0f
#define GY0 68.0f
typedef struct { int item; bool dug; } Spot;                    /* item: 0 nothing, 1 chest, 2 gem, 3 coins, 4 boot, 5 bone */
static Spot spots[NC * NR];
static int found;
static float tick_t, hot, px_, py_, dig_flash;

static void start(void) {
  for (int i = 0; i < NC * NR; i++) spots[i] = (Spot){0, false};
  for (int n = 0; n < 5; n++) { int i; do i = irand(NC * NR); while (spots[i].item); spots[i].item = 1 + n % 3; }
  for (int n = 0; n < 4; n++) { int i; do i = irand(NC * NR); while (spots[i].item); spots[i].item = 4 + n % 2; }
  found = 0; tick_t = 0; hot = 0; px_ = 320; py_ = 240; dig_flash = 0;
}

static float cx_of(int i) { return GX0 + (i % NC) * CELL + CELL / 2; }
static float cy_of(int i) { return GY0 + (i / NC) * CELL + CELL / 2; }
static int spot_at(float x, float y) { for (int i = 0; i < NC * NR; i++) if (in_rect(x, y, GX0 + (i % NC) * CELL, GY0 + (i / NC) * CELL, CELL, CELL)) return i; return -1; }
static bool is_treasure(int item) { return item >= 1 && item <= 3; }

static void update(float dt, const Input *in) {
  px_ = in->x; py_ = in->y;
  float best = 1e9f;
  for (int i = 0; i < NC * NR; i++) if (!spots[i].dug && is_treasure(spots[i].item)) { float d = sqrtf(sqf(cx_of(i) - px_) + sqf(cy_of(i) - py_)); if (d < best) best = d; }
  hot = clampf(1.0f - best / 240.0f, 0, 1);
  if (dig_flash > 0) dig_flash -= dt;
  tick_t -= dt;
  if (hot > 0.3f && tick_t <= 0) { audio_sfx(SFX_TICK); if (hot > 0.8f) input_rumble(3); tick_t = lerpf(0.8f, 0.12f, hot * hot); }
  if (!in->a_down) return;
  int i = spot_at(in->x, in->y);
  if (i < 0 || spots[i].dug) return;
  spots[i].dug = true; dig_flash = 0.3f;
  R.time_left -= 1.5f;
  if (R.time_left < 0.05f) R.time_left = 0.05f;
  float x = cx_of(i), y = cy_of(i);
  if (is_treasure(spots[i].item)) {
    found++; fw_add_score(100);
    fx_burst(x, y, RGB(255, 225, 70), 24); fx_popup(x - 24, y - 40, "+100", RGB(255, 235, 120));
    audio_sfx(SFX_GOOD); input_rumble(10);
    if (found == 5) { fw_add_score((int)(R.time_left * 10)); fw_finish(true, "All the treasure!"); }
  } else if (spots[i].item >= 4) {
    fw_add_score(5); fx_popup(x - 14, y - 40, "+5", RGB(255, 255, 255)); audio_sfx(SFX_FLIP);
  } else audio_sfx(SFX_CLICK);
}

static void draw_item(int item, float x, float y) {
  switch (item) {
    case 1: gfx_rrect(x - 26, y - 6, 52, 30, 4, RGB(150, 95, 45)); gfx_rrect(x - 28, y - 22, 56, 20, 8, RGB(190, 125, 60)); gfx_rect(x - 5, y - 8, 10, 12, RGB(255, 215, 60)); break;
    case 2: gfx_quad(x, y - 28, x + 24, y - 4, x, y + 24, x - 24, y - 4, RGB(80, 230, 240)); gfx_tri(x - 24, y - 4, x, y - 4, x, y - 28, RGBA(255, 255, 255, 120)); break;
    case 3: for (int k = 0; k < 5; k++) gfx_circle(x - 16 + k * 8, y + 6 - (k % 2) * 10, 11, RGB(255, 215, 60)); break;
    case 4: gfx_rect(x - 12, y - 24, 14, 30, RGB(110, 80, 50)); gfx_quad(x - 12, y + 2, x + 22, y + 8, x + 22, y + 20, x - 12, y + 20, RGB(90, 65, 40)); break;
    case 5: gfx_rrect(x - 24, y - 6, 48, 12, 6, RGB(240, 240, 230)); for (int k = 0; k < 4; k++) gfx_circle(x - 24 + (k % 2) * 48, y - 8 + (k / 2) * 16, 7, RGB(240, 240, 230)); break;
    default: break;
  }
}

static void draw(void) {
  gfx_rect(0, 50, WORLD_W, 430, RGB(94, 170, 80));
  for (int i = 0; i < NC * NR; i++) {
    float x = cx_of(i), y = cy_of(i);
    if (spots[i].dug) {
      gfx_ellipse(x, y + 6, 40, 28, RGB(98, 64, 38)); gfx_ellipse(x, y + 4, 33, 22, RGB(70, 44, 26));
      draw_item(spots[i].item, x, y + 4);
    } else {
      gfx_circle(x - 18, y + 8, 22, RGB(52, 128, 62)); gfx_circle(x + 16, y + 10, 24, RGB(60, 140, 70)); gfx_circle(x, y - 8, 26, RGB(70, 156, 78));
      gfx_circle(x - 8, y - 14, 7, RGBA(255, 255, 255, 50));
    }
  }
  Color c = RGB((int)lerpf(70, 255, hot), (int)(lerpf(150, 70, hot) + 40 * sinf(hot * 3)), (int)lerpf(255, 60, hot));
  gfx_ring(px_, py_, 24 + hot * 22 + sinf(R.elapsed * 8) * 3 * hot, 30 + hot * 26, WITH_ALPHA(c, 200));
  gfx_text_center(WORLD_W * 0.5f, 54, 22, c, hot > 0.8f ? "Burning hot!" : (hot > 0.55f ? "Hot!" : (hot > 0.3f ? "Warm" : "Cold")));
  char b[40]; snprintf(b, sizeof b, "Treasure %d/5", found);
  gfx_text(16, 452, 20, RGB(255, 255, 255), b);
}

static void icon(float cx, float cy, float s) {
  gfx_ellipse(cx, cy + s * 0.2f, s * 0.4f, s * 0.2f, RGB(98, 64, 38));
  gfx_rrect(cx - s * 0.22f, cy - s * 0.06f, s * 0.44f, s * 0.26f, 4, RGB(150, 95, 45));
  gfx_rrect(cx - s * 0.24f, cy - s * 0.2f, s * 0.48f, s * 0.17f, 8, RGB(190, 125, 60));
  draw_star(cx, cy - s * 0.34f, s * 0.12f, RGB(255, 225, 70));
}

const GameDef game_treasure = {
  "Treasure Hunt", "Hot or cold?",
  {"Five treasures are buried under the bushes.", "Move the shovel: the glow turns red when you are close.", "Press A to dig. Each dig costs 1.5 seconds!", NULL},
  "Search: point at the screen   Dig: A", RGB(130, 200, 100), RGB(70, 140, 70), 50, 0, start, update, draw, icon, CUR_SHOVEL, INP_POINT | INP_A, 600, 900};
