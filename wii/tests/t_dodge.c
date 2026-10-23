#include "../source/g_dodge.c"
#include "harness.h"
int main(void) {
  begin_game(5);
  for (int i = 0; i < MAX_O; i++) os[i].on = false;
  spawn_t = 100; laser_t = 100;
  Input in = at(px, py);
  os[0] = (Obj){px, py, 0, 0, 20, 0, 0, true};
  int lives = R.lives; tick(&in, 1.0f / 60);
  CHECK(R.lives == lives - 1, "a rock costs a heart");
  os[1] = (Obj){px, py, 0, 0, 20, 0, 0, true}; tick(&in, 1.0f / 60);
  CHECK(R.lives == lives - 1, "no second hit while still flashing");
  run(2, &in);
  Input dash = at(px, py); dash.a_down = true; tick(&dash, 1.0f / 60);
  os[2] = (Obj){px, py, 0, 0, 20, 0, 0, true}; lives = R.lives; tick(&in, 1.0f / 60);
  CHECK(R.lives == lives, "dashing makes you immune");
  os[3] = (Obj){px, py, 0, 0, 14, 1, 0, true}; int s = R.score; tick(&in, 1.0f / 60);
  CHECK(R.score - s >= 25, "a star is worth 25");
  CHECK(dash_cd > 1.0f, "the dash has a cooldown");
  run(2, &in);
  os[4] = (Obj){0, py, 0, 0, 12, 2, 0.5f, true}; lives = R.lives; run(1.0f, &in);
  CHECK(R.lives == lives - 1 || hit_t > 0, "a laser hurts");
  for (int f = 0; f < 60 * 300 && fw_phase() == PH_PLAY; f++) tick(&in, 1.0f / 60);
  CHECK(fw_phase() == PH_RESULTS, "standing still eventually loses");
  return finish_test("dodge");
}
