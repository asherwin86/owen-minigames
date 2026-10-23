/* A guided tour for the screenshots and video: title, menu with the pointer moving over every tile, each game's
 * instruction screen, the pause menu and a results screen. It also checks the screens react to the buttons. */
#include "harness.h"
#include "../source/games.h"

static float px_ = 320, py_ = 240;
static void glide(float x, float y, float seconds) {
  float x0 = px_, y0 = py_; int n = (int)(seconds * 60); if (n < 1) n = 1;
  for (int i = 1; i <= n; i++) { float t = (float)i / n; t = t * t * (3 - 2 * t); Input in = at(lerpf(x0, x, t), lerpf(y0, y, t)); tick(&in, 1.0f / 60); }
  px_ = x; py_ = y;
}
static void click(void) { Input in = press_a_at(px_, py_); tick(&in, 1.0f / 60); }
static void wait(float s) { Input in = at(px_, py_); run(s, &in); }
static void tile_center(int g, float *x, float *y) { *x = 14 + (g % 5) * 124.0f + 58; *y = 92 + (g / 5) * 180.0f + 80; }

int main(void) {
  rng_seed(99); fw_init();
  wait(3.5f);                                   /* title */
  CHECK(fw_phase() == PH_TITLE, "title");
  click();
  CHECK(fw_phase() == PH_MENU, "menu");
  for (int g = 0; g < GAME_COUNT; g++) { float x, y; tile_center(g, &x, &y); glide(x, y, 0.45f); wait(0.25f); }
  for (int g = 0; g < GAME_COUNT; g++) {
    float x, y; tile_center(g, &x, &y); glide(x, y, 0.4f); click();
    CHECK(fw_phase() == PH_READY && fw_current() == g, "game %d instructions", g);
    wait(2.2f);
    Input b = at(px_, py_); b.b_down = true; tick(&b, 1.0f / 60);
    CHECK(fw_phase() == PH_MENU, "back to menu");
  }
  { float x, y; tile_center(2, &x, &y); glide(x, y, 0.4f); click(); glide(215, 432, 0.5f); click();
    CHECK(fw_phase() == PH_COUNT, "countdown"); wait(4.2f);
    CHECK(fw_phase() == PH_PLAY, "playing");
    Input p = at(px_, py_); p.plus_down = true; tick(&p, 1.0f / 60); wait(2.0f);
    CHECK(fw_phase() == PH_PAUSE, "pause overlay");
    glide(320, 217, 0.4f); click(); CHECK(fw_phase() == PH_PLAY, "resumed");
    run(42.5f, &(Input){.connected = true, .ir_valid = true, .x = 320, .y = 240});
    CHECK(fw_phase() == PH_RESULTS, "results"); wait(3.0f); }
  Input dc = idle(); dc.connected = false; run(2.5f, &dc);          /* the Wii Remote drops out */
  wait(1.5f);
  return finish_test("showcase");
}
