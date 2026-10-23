#include "../source/g_target.c"
#include "harness.h"
static int first_target(void) { for (int i = 0; i < MAX_T; i++) if (ts[i].on) return i; return -1; }
int main(void) {
  begin_game(1);
  CHECK(R.lives == 3, "three lives");
  Input in = idle(); while (first_target() < 0) tick(&in, 1.0f / 60);
  int i = first_target(); Target t = ts[i];
  int before = R.score; Input a = press_a_at(t.x, t.y); tick(&a, 0.0f);
  CHECK(R.score - before >= 100 && R.score - before <= 140, "bullseye is 100 + up to 40 speed bonus (%d)", R.score - before);
  while (first_target() < 0) tick(&in, 1.0f / 60);
  i = first_target(); t = ts[i]; before = R.score;
  a = press_a_at(t.x + t.r * 0.9f, t.y); tick(&a, 0.0f);
  CHECK(R.score - before >= 30 && R.score - before <= 70, "outer ring is 30 + bonus (%d)", R.score - before);
  /* a target that expires costs a life */
  for (int k = 0; k < MAX_T; k++) ts[k].on = false;
  int lives = R.lives; Input idle_in = idle();
  for (int f = 0; f < 60 * 8 && R.lives == lives; f++) tick(&idle_in, 1.0f / 60);
  CHECK(R.lives == lives - 1, "an expired target costs a heart (%d -> %d)", lives, R.lives);
  for (int f = 0; f < 60 * 120 && fw_phase() == PH_PLAY; f++) tick(&idle_in, 1.0f / 60);
  CHECK(fw_phase() == PH_RESULTS, "ignoring every target ends the round");
  return finish_test("target");
}
