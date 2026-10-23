#include "../source/g_gun.c"
#include "harness.h"
static void calm(void) { for (int i = 0; i < SLOTS; i++) { slots[i] = (Slot){0, 0, 0, 0, false}; } spawn_t = 100; }
int main(void) {
  begin_game(10);
  CHECK(R.lives == 3 && R.time_left > 59, "3 hearts and a 60 s clock");
  CHECK(ammo == MAG, "starts with a full gun");
  calm();
  /* headshot and bodyshot on a bandit */
  slots[0] = (Slot){1, 0.4f, 1.5f, 0, false};
  float x, y; slot_pos(0, &x, &y);
  int a0 = ammo; Input s = press_a_at(x, y - 84); s.b_down = false; tick(&s, 1.0f / 60);
  CHECK(R.score >= 150 && R.score <= 200 && !slots[0].kind, "a headshot scores 150-200 (got %d)", R.score);
  CHECK(ammo == a0 - 1, "firing uses a bullet");
  calm(); R.score = 0;
  slots[4] = (Slot){1, 0.4f, 1.5f, 0, false}; slot_pos(4, &x, &y);
  s = press_a_at(x, y - 30); s.a_down = false; s.b_down = true; tick(&s, 1.0f / 60);
  CHECK(R.score >= 100 && R.score < 150, "B (the trigger) also fires, and a body shot scores 100-149 (got %d)", R.score);
  /* a townsperson */
  calm(); R.score = 200; int lives = R.lives;
  slots[1] = (Slot){2, 0.4f, 1.5f, 0, false}; slot_pos(1, &x, &y);
  s = press_a_at(x, y - 40); tick(&s, 1.0f / 60);
  CHECK(R.score == 150 && R.lives == lives - 1, "shooting a townsperson costs 50 points and a heart (score %d, lives %d)", R.score, R.lives);
  /* a bandit who is not shot fires back */
  calm(); lives = R.lives;
  slots[2] = (Slot){1, 0.0f, 0.5f, 0, false};
  Input n = at(10, 460); run(0.7f, &n);
  CHECK(R.lives == lives - 1, "an ignored bandit shoots you (lives %d)", R.lives);
  /* a miss uses a bullet and scores nothing */
  calm(); R.score = 0; a0 = ammo; s = press_a_at(5, 100); tick(&s, 1.0f / 60);
  CHECK(R.score == 0 && ammo == a0 - 1, "a miss costs only a bullet");
  /* running dry, reloading */
  calm(); ammo = 0;
  s = press_a_at(5, 100); tick(&s, 1.0f / 60);
  CHECK(reload_t > 0, "pulling the trigger on an empty gun starts a reload");
  run(1.0f, &n); CHECK(ammo == MAG && reload_t <= 0, "the reload finishes with a full gun");
  ammo = 2; Input r = at(10, 460); r.one_down = true; tick(&r, 1.0f / 60);
  CHECK(reload_t > 0, "1 reloads on request"); run(1.0f, &n); CHECK(ammo == MAG, "full again");
  r = at(10, 460); r.flick = true; ammo = 3; tick(&r, 1.0f / 60); CHECK(reload_t > 0, "swinging the remote reloads");
  run(1, &n);
  /* while reloading, firing does nothing */
  calm(); ammo = 3; reload_t = 0.5f; slots[0] = (Slot){1, 0.4f, 1.5f, 0, false}; slot_pos(0, &x, &y);
  s = press_a_at(x, y - 84); int sc = R.score; tick(&s, 1.0f / 60); CHECK(R.score == sc && slots[0].kind == 1, "no shooting while reloading");
  /* difficulty: more targets at once later on */
  start(); R.elapsed = 55; int most = 0; for (int f = 0; f < 60 * 10; f++) { Input k = at(10, 460); update(1.0f / 60, &k); int b = busy(); if (b > most) most = b; if (R.lives <= 0) break; }
  CHECK(most >= 2, "several bandits appear at once later in the round (%d)", most);
  return finish_test("gun");
}
