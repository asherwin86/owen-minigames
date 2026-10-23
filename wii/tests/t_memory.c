#include "../source/g_memory.c"
#include "harness.h"
static void flip(int c) { Input a = press_a_at(X0 + (c % 4) * STEP + 40, Y0 + (c / 4) * STEP + 40); tick(&a, 1.0f / 60); }
int main(void) {
  begin_game(4);
  int count[8] = {0}; for (int i = 0; i < GRID; i++) count[cards[i].sym]++;
  for (int s = 0; s < 8; s++) CHECK(count[s] == 2, "symbol %d appears exactly twice", s);
  /* a mismatch costs 5 and turns the cards back over after a moment */
  R.score = 50;
  int a = 0, b = -1; for (int i = 1; i < GRID; i++) if (cards[i].sym != cards[0].sym) { b = i; break; }
  flip(a); flip(b);
  CHECK(R.score == 45, "mismatch costs 5 (score %d)", R.score);
  flip(5);   /* ignored while the wrong pair is showing */
  run(1.2f, &(Input){.connected = true});
  CHECK(!cards[a].up && !cards[b].up, "wrong pair flips back");
  /* solve it */
  R.score = 0; int pairs_done = 0; bool used[GRID] = {false};
  for (int i = 0; i < GRID; i++) if (!used[i]) for (int j = i + 1; j < GRID; j++) if (!used[j] && cards[j].sym == cards[i].sym) {
    used[i] = used[j] = true; flip(i); flip(j); pairs_done++;
    if (pairs_done < 8) CHECK(R.score == pairs_done * 100, "each pair is worth 100 (%d)", R.score);
    break;
  }
  CHECK(pairs == 8 && fw_phase() == PH_RESULTS, "all eight pairs ends the round (phase %d)", (int)fw_phase());
  CHECK(R.score >= 800 + 5 * 70 - 5, "finishing early adds a time bonus (score %d)", R.score);
  return finish_test("memory");
}
