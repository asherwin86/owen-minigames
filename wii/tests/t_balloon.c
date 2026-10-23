#include "../source/g_balloon.c"
#include "harness.h"
int main(void) {
  begin_game(0);
  CHECK(R.time_left > 49 && R.time_left <= 50, "round is 50 seconds");
  /* wait for a balloon, pop it: +10 for the first, then the combo bonus grows by 2 */
  int expect = 0, popped = 0;
  for (int guard = 0; guard < 2000 && popped < 4; guard++) {
    Input in = idle(); tick(&in, 1.0f / 60);
    for (int i = 0; i < MAX_B && popped < 4; i++) if (bs[i].on && !bs[i].bomb && bs[i].y > 80 && bs[i].y < 440) {
      float x = bs[i].x + sinf(bs[i].wob) * 8, y = bs[i].y;
      int before = R.score; Input a = press_a_at(x, y); tick(&a, 0.0f);
      int pts = 10 + (popped < 5 ? popped : 5) * 2; expect += pts; popped++;
      CHECK(R.score - before == pts, "pop #%d scores %d (got %d)", popped, pts, R.score - before);
    }
  }
  CHECK(popped == 4 && R.score == expect, "four pops add up (%d vs %d)", R.score, expect);
  R.score = 100;                               /* a bomb costs 15 and breaks the combo */
  for (int guard = 0; guard < 6000; guard++) {
    Input in = idle(); tick(&in, 1.0f / 60);
    int found = -1; for (int i = 0; i < MAX_B; i++) if (bs[i].on && bs[i].bomb && bs[i].y > 80 && bs[i].y < 440) found = i;
    if (found >= 0) { int before = R.score; Input a = press_a_at(bs[found].x + sinf(bs[found].wob) * 8, bs[found].y); tick(&a, 0.0f); CHECK(before - R.score == 15, "bomb costs 15 (lost %d)", before - R.score); CHECK(combo == 0, "bomb resets the combo"); break; }
    if (guard == 5999) CHECK(0, "no bomb appeared in 100 seconds");
  }
  R.score = 0; { Input a = press_a_at(5, 475); tick(&a, 0.0f); }
  CHECK(R.score == 0, "popping nothing leaves the score alone");
  run(55, &(Input){.connected = true});
  CHECK(fw_phase() == PH_RESULTS, "time's up ends the round");
  return finish_test("balloon");
}
