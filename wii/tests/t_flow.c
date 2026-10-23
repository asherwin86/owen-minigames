/* Framework tests: menu, instructions, countdown, pause, results, replay, disconnect, and a random "monkey" player
 * for every game to catch crashes, NaNs and stuck states. */
#include "harness.h"
#include "../source/games.h"

static void bot(float seconds, int game) {
  unsigned s = 77u + (unsigned)game;
  float t = 0;
  while (t < seconds && fw_phase() == PH_PLAY) {
    Input in = idle();
    s = s * 1664525u + 1013904223u;
    in.x = (float)((s >> 8) % 640); in.y = (float)((s >> 4) % 480);
    in.a = ((s >> 20) & 3) == 0; in.a_down = in.a;
    in.b = ((s >> 22) & 7) == 0; in.left = ((s >> 24) & 7) == 0; in.right = ((s >> 25) & 7) == 0;
    in.tilt = ((s >> 12) & 255) / 128.0f - 1.0f;
    tick(&in, 1.0f / 60); t += 1.0f / 60;
  }
}

int main(void) {
  /* title / menu navigation by pointer */
  rng_seed(5); fw_init();
  Input i = idle();
  i.home_down = true; tick(&i, 0.016f);
  CHECK(fw_wants_exit(), "HOME on the title screen asks to exit");
  fw_init();
  i = idle(); i.a_down = true; tick(&i, 0.016f);
  CHECK(fw_phase() == PH_MENU, "title -> menu");
  for (int g = 0; g < GAME_COUNT; g++) {       /* every tile can be picked with the pointer */
    float x, y; fw_tile_center(g, &x, &y);
    i = at(x, y); tick(&i, 0.016f);
    i.a_down = true; tick(&i, 0.016f);
    CHECK(fw_phase() == PH_READY && fw_current() == g, "tile %d opens its instructions (phase %d, game %d)", g, (int)fw_phase(), fw_current());
    i = idle(); i.b_down = true; tick(&i, 0.016f);
    CHECK(fw_phase() == PH_MENU, "B returns to the menu");
  }
  /* d-pad menu navigation */
  i = idle(); i.ir_valid = false; i.right_down = true; tick(&i, 0.016f); tick(&i, 0.016f);
  i = idle(); i.ir_valid = false; i.a_down = true; tick(&i, 0.016f);
  CHECK(fw_phase() == PH_READY, "d-pad selection + A works without a pointer");

  /* every game: instructions have text, timers and lives are set, pause/resume/restart/menu work */
  for (int g = 0; g < GAME_COUNT; g++) {
    const GameDef *d = GAME_LIST[g];
    CHECK(d->name && d->tagline && d->how[0] && d->controls && d->start && d->update && d->draw && d->icon, "game %d is fully defined", g);
    begin_game(g);
    CHECK(R.score == 0 && R.elapsed < 0.1f, "game %d starts from zero", g);
    CHECK((d->seconds > 0) == (R.time_left >= 0), "game %d clock matches its definition", g);
    CHECK((d->lives > 0) == (R.lives >= 0), "game %d lives match its definition", g);
    Input p = idle(); p.plus_down = true; tick(&p, 0.016f);
    CHECK(fw_phase() == PH_PAUSE, "game %d: + pauses", g);
    float tl = R.time_left; run(2, &(Input){.connected = true}); CHECK(R.time_left == tl, "game %d: the clock is frozen while paused", g);
    p = press_a_at(320, 217); tick(&p, 0.016f);  /* Resume */
    CHECK(fw_phase() == PH_PLAY, "game %d: Resume", g);
    p = idle(); p.home_down = true; tick(&p, 0.016f);
    p = press_a_at(320, 283); tick(&p, 0.016f);  /* Restart */
    CHECK(fw_phase() == PH_COUNT, "game %d: Restart goes through the countdown", g);
    Input q = idle(); run(3.6f, &q);
    CHECK(fw_phase() == PH_PLAY && R.elapsed < 0.2f, "game %d: restarted cleanly", g);
    p = idle(); p.plus_down = true; tick(&p, 0.016f);
    p = press_a_at(320, 349); tick(&p, 0.016f);  /* Menu */
    CHECK(fw_phase() == PH_MENU, "game %d: Menu from pause", g);
  }

  /* monkey test: random play for each game; timed games must end by themselves */
  for (int g = 0; g < GAME_COUNT; g++) {
    begin_game(g);
    float len = GAME_LIST[g]->seconds > 0 ? GAME_LIST[g]->seconds + 40 : 150;   /* +40: Memory/Racing/Treasure can extend or shorten the clock */
    bot(len, g);
    if (GAME_LIST[g]->seconds > 0) CHECK(fw_phase() == PH_RESULTS, "timed game %d ends on its own (phase %d, time %.1f)", g, (int)fw_phase(), R.time_left);
    else CHECK(fw_phase() == PH_RESULTS || fw_phase() == PH_PLAY, "endless game %d is in a valid state", g);
    if (fw_phase() == PH_PLAY) { Input p = idle(); p.home_down = true; tick(&p, 0.016f); }
    if (fw_phase() == PH_RESULTS) {            /* results -> play again -> results -> menu */
      CHECK(fw_best(g) >= R.score, "best score tracks the score for game %d", g);
      Input p = press_a_at(215, 420); tick(&p, 0.016f);
      CHECK(fw_phase() == PH_COUNT, "game %d: Play again", g);
    }
  }

  /* disconnecting the Wii Remote freezes everything until it comes back */
  begin_game(0);
  float tl = R.time_left; Input dc = idle(); dc.connected = false; run(2, &dc);
  CHECK(R.time_left == tl, "the clock waits while the Wii Remote is disconnected");
  Input back = idle(); run(1, &back);
  CHECK(R.time_left < tl, "play resumes when it reconnects");

  /* widescreen: drawing must work with a wider world */
  g_screen_w = 853.3f; begin_game(2); run(1, &(Input){.connected = true, .ir_valid = true, .x = 100, .y = 100}); g_screen_w = 640.0f;
  CHECK(fw_phase() == PH_PLAY, "16:9 drawing runs");
  return finish_test("flow");
}
