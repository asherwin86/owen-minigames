#include "../source/g_racing.c"
#include "harness.h"
/* Drive like a person would: keep the car near the middle of the road, because the road's curves push it wide. */
static void drive(float seconds, bool gas, bool brake) {
  for (int f = 0; f < (int)(seconds * 60); f++) {
    Input in = idle(); in.ir_valid = false; in.a = gas; in.b = brake;
    in.left = px > 0.12f; in.right = px < -0.12f;
    tick(&in, 1.0f / 60);
  }
}

int main(void) {
  begin_game(8);
  CHECK(R.time_left > 39.5f, "40 second clock");
  drive(4, true, false);
  CHECK(v > 400, "holding A speeds the car up (%.0f)", v);
  drive(2, false, true);
  CHECK(v < 200, "B brakes (%.0f)", v);
  /* ...and without steering, the curves carry the car off the road, which slows it right down */
  { px = 0; Input gas = idle(); gas.a = true; gas.ir_valid = false; run(12, &gas); CHECK(fabsf(px) > 1.0f && v < 300, "an unsteered car leaves the road and slows (px %.2f, v %.0f)", px, v); px = 0; v = 300; }
  /* coin, car, cone */
  for (int i = 0; i < MAX_O; i++) os[i].on = false;
  next_spawn = z + 100000;
  v = 300; os[0] = (Obj){z + 30, px, 0, true}; int s = R.score, c0 = coins; Input n = idle(); n.ir_valid = false; tick(&n, 1.0f / 60);
  CHECK(R.score - s >= 20 && coins == c0 + 1, "a coin is +20 (score +%d, coins %d -> %d)", R.score - s, c0, coins);
  os[0] = (Obj){z + 30, px, 1, true}; float t0 = R.time_left, v0 = v; tick(&n, 1.0f / 60);
  CHECK(R.time_left <= t0 - 2.4f && v < v0 * 0.5f, "a car costs 2.5 s and most of the speed");
  v = 300; os[0] = (Obj){z + 30, px, 2, true}; t0 = R.time_left; tick(&n, 1.0f / 60);
  CHECK(R.time_left <= t0 - 0.9f, "a cone costs 1 s");
  os[0] = (Obj){z + 30, px + 0.9f, 1, true}; t0 = R.time_left; tick(&n, 1.0f / 60);
  CHECK(R.time_left > t0 - 0.1f, "a car in another lane misses you");
  /* checkpoint */
  z = next_check - 1; t0 = R.time_left; s = R.score; tick(&n, 1.0f / 60);
  CHECK(R.time_left > t0 + 7, "a checkpoint adds 8 s");
  /* steering */
  px = 0; Input l = idle(); l.ir_valid = false; l.left = true; v = 400; run(1, &l);
  CHECK(px < -0.2f, "the pad steers left (%.2f)", px);
  Input tl = idle(); tl.ir_valid = false; tl.tilt = 0.8f; px = 0; run(1, &tl);
  CHECK(px > 0.2f, "tilting steers right (%.2f)", px);
  px = 1.2f; v = 500; run(2, &n); CHECK(v < 300, "driving off the road slows you down (%.0f)", v);
  return finish_test("racing");
}
