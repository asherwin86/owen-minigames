#include "../source/g_bubble.c"
#include "harness.h"
int main(void) {
  begin_game(7);
  memset(grid, -1, sizeof grid);
  /* two red bubbles side by side in the top row; firing a third next to them pops all three */
  grid[0][0] = grid[0][1] = 0; grid[1][0] = 2;
  cur_c = 0; bx = cell_x(0, 2); by = cell_y(0); flying = true; until_row = 6;
  int s = R.score; settle();
  CHECK(R.score - s >= 30, "three in a row pop (+%d)", R.score - s);
  CHECK(grid[0][0] < 0 && grid[0][1] < 0 && grid[0][2] < 0, "the matching bubbles are gone");
  CHECK(grid[1][0] < 0, "the bubble hanging from them falls too (+20)");
  /* two does not pop */
  memset(grid, -1, sizeof grid); grid[0][0] = 1; grid[5][5] = 3;
  cur_c = 1; bx = cell_x(0, 1); by = cell_y(0); until_row = 6; s = R.score; settle();
  CHECK(R.score == s && grid[0][0] == 1 && grid[0][1] == 1, "two of a kind just stick");
  /* clearing the board wins */
  memset(grid, -1, sizeof grid); grid[0][0] = grid[0][1] = 4; cur_c = 4; bx = cell_x(0, 2); by = cell_y(0); until_row = 6; settle();
  CHECK(fw_phase() == PH_RESULTS, "an empty board wins");
  /* reaching the bottom loses */
  begin_game(7); memset(grid, -1, sizeof grid); grid[ROWS - 1][0] = 2; cur_c = 1; bx = cell_x(ROWS - 1, 6); by = cell_y(ROWS - 1) - 5; until_row = 6; settle();
  CHECK(fw_phase() == PH_RESULTS, "bubbles at the bottom lose");
  /* aiming and firing */
  begin_game(7); Input a = press_a_at(320, 100); tick(&a, 1.0f / 60);
  CHECK(flying, "A fires a bubble");
  for (int f = 0; f < 600 && flying; f++) tick(&(Input){.connected = true, .x = 320, .y = 100}, 1.0f / 60);
  CHECK(!flying, "the bubble lands");
  CHECK(aim <= -0.17f && aim >= -PI_F + 0.17f, "aim stays inside the cannon's range");
  return finish_test("bubble");
}
