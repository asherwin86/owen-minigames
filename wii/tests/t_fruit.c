#include "../source/g_fruit.c"
#include "harness.h"
int main(void) {
  begin_game(3);
  CHECK(R.lives == 3, "three lives");
  for (int i = 0; i < MAX_F; i++) fs[i].on = false;
  fs[0] = (Fruit){bx, BASKET_Y - 12, 100, 0, 0, true};
  Input in = idle(); in.ir_valid = false; tick(&in, 1.0f / 60);
  CHECK(R.score == 10 && !fs[0].on, "catching a fruit scores 10 (got %d)", R.score);
  fs[0] = (Fruit){bx, BASKET_Y - 12, 100, 0, 5, true}; tick(&in, 1.0f / 60);
  CHECK(R.score == 60, "a golden star is worth 50 (score %d)", R.score);
  int lives = R.lives;
  fs[0] = (Fruit){bx, BASKET_Y - 12, 100, 0, 4, true}; tick(&in, 1.0f / 60);
  CHECK(R.lives == lives - 1, "catching a bomb costs a heart");
  lives = R.lives;
  fs[0] = (Fruit){bx + 250 > 600 ? bx - 250 : bx + 250, WORLD_H + 19, 100, 0, 1, true}; tick(&in, 1.0f / 60);
  CHECK(R.lives == lives - 1, "missing a fruit costs a heart");
  Input left = idle(); left.ir_valid = false; left.left = true; float x0 = bx; run(0.5f, &left);
  CHECK(bx < x0 - 100, "the d-pad slides the basket");
  Input pt = at(500, 300); run(1, &pt);
  CHECK(fabsf(bx - 500) < 5, "the basket follows the pointer (%.0f)", bx);
  CHECK(fw_phase() == PH_PLAY || fw_phase() == PH_RESULTS, "valid state");
  for (int f = 0; f < 60 * 200 && fw_phase() == PH_PLAY; f++) { Input stay = at(bx > 320 ? 0 : 640, 300); tick(&stay, 1.0f / 60); }
  CHECK(fw_phase() == PH_RESULTS, "running out of hearts ends the game");
  return finish_test("fruit");
}
