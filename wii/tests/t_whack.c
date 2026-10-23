#include "../source/g_whack.c"
#include "harness.h"
int main(void) {
  begin_game(2);
  CHECK(R.time_left > 39 && R.time_left <= 40, "round is 40 seconds");
  int kinds_seen[3] = {0, 0, 0};
  for (int guard = 0; guard < 8000; guard++) {
    Input in = idle(); tick(&in, 1.0f / 60);
    for (int i = 0; i < N; i++) if (holes[i].up && holes[i].t > 0.15f && holes[i].t < holes[i].dur - 0.1f) {
      int kind = holes[i].kind, before = R.score; R.score += 100;      /* headroom so the bomb penalty is visible */
      before = R.score;
      Input a = press_a_at(HX[i % 3], HY[i / 3] - 14); tick(&a, 0.0f);
      int want = kind == 1 ? 30 : (kind == 2 ? -15 : 10);
      CHECK(R.score - before == want, "kind %d mole scores %d (got %d)", kind, want, R.score - before);
      CHECK(!holes[i].up, "a whacked mole goes down");
      kinds_seen[kind]++;
    }
    if (kinds_seen[0] && kinds_seen[1] && kinds_seen[2]) break;
  }
  CHECK(kinds_seen[0] && kinds_seen[1] && kinds_seen[2], "saw normal, golden and bomb moles");
  { int before = R.score; Input a = press_a_at(5, 100); tick(&a, 0.0f); CHECK(R.score == before, "missing changes nothing"); }
  return finish_test("whack");
}
