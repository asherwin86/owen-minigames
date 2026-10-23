#include "../source/g_treasure.c"
#include "harness.h"
int main(void) {
  begin_game(9);
  int treasures = 0, junk = 0; for (int i = 0; i < NC * NR; i++) { if (is_treasure(spots[i].item)) treasures++; if (spots[i].item >= 4) junk++; }
  CHECK(treasures == 5 && junk == 4, "5 treasures and 4 junk items are buried (%d, %d)", treasures, junk);
  int empty = -1; for (int i = 0; i < NC * NR; i++) if (!spots[i].item) { empty = i; break; }
  float t0 = R.time_left; Input a = press_a_at(cx_of(empty), cy_of(empty)); tick(&a, 1.0f / 60);
  CHECK(spots[empty].dug && R.time_left < t0 - 1.4f, "digging costs 1.5 s");
  t0 = R.time_left; tick(&a, 1.0f / 60); CHECK(R.time_left > t0 - 0.1f, "an already-dug hole costs nothing");
  int tr = -1; for (int i = 0; i < NC * NR; i++) if (is_treasure(spots[i].item)) { tr = i; break; }
  Input near = at(cx_of(tr) + 5, cy_of(tr)); tick(&near, 1.0f / 60); CHECK(hot > 0.9f, "right on top of treasure is burning hot (%.2f)", hot);
  Input far = at(cx_of(tr) + 600, cy_of(tr) + 400); tick(&far, 1.0f / 60);
  float best = 1e9f; for (int i = 0; i < NC * NR; i++) if (is_treasure(spots[i].item)) { float d = hypotf(cx_of(i) - px_, cy_of(i) - py_); if (d < best) best = d; }
  CHECK(hot < 0.5f || best < 130, "far from treasure is cold (%.2f)", hot);
  int s = R.score;
  for (int i = 0; i < NC * NR; i++) if (is_treasure(spots[i].item)) { Input d = press_a_at(cx_of(i), cy_of(i)); tick(&d, 1.0f / 60); }
  CHECK(found == 5 && fw_phase() == PH_RESULTS, "finding all five wins (found %d)", found);
  CHECK(R.score - s >= 500, "each treasure is +100 (%d)", R.score - s);
  return finish_test("treasure");
}
