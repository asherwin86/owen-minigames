#include "../source/g_fishing.c"
#include "harness.h"
int main(void) {
  begin_game(6);
  for (int i = 0; i < MAX_FISH; i++) fish[i].on = false;
  spawn_t = 100;
  for (int kind = 0; kind < 5; kind++) {
    fish[0] = (Fish){boat_x, 280, 0, 22, kind, true, false};
    int before = R.score; Input in = at(boat_x, 100); in.a_down = true; tick(&in, 1.0f / 60);
    CHECK(state == 1, "A drops the hook");
    in = at(boat_x, 100); for (int f = 0; f < 60 * 8 && state != 0; f++) tick(&in, 1.0f / 60);
    int want = VALUE[kind] + (R.score < 0 ? 0 : 0);
    int got = R.score - before; if (before + VALUE[kind] < 0) got = -before;
    CHECK(state == 0, "the hook comes back up");
    CHECK(got == (before + want < 0 ? -before : want), "fish kind %d scores %d (got %d)", kind, want, got);
    R.score += 50;
  }
  Input fl = at(boat_x, 100); fl.flick = true; tick(&fl, 1.0f / 60);
  CHECK(state == 1, "swinging the remote also drops the hook");
  return finish_test("fishing");
}
