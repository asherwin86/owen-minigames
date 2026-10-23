#include "../source/g_fight.c"
#include "harness.h"
static Input hold(bool a, bool b, bool one) { Input i = idle(); i.ir_valid = false; i.a_down = a; i.b_down = b; i.one = one; return i; }
static void calm_cpu(void) { cpu.state = S_IDLE; ai_t = 1000; cpu.block = false; }
int main(void) {
  begin_game(11);
  CHECK(pl.hp == 100 && cpu.hp == 90 && level == 0, "fresh fight: you 100 hp, first opponent 90");
  run(1.6f, &(Input){.connected = true});
  /* a punch in range hurts */
  pl.x = 200; cpu.x = 250; calm_cpu(); float hp0 = cpu.hp; int s0 = R.score;
  Input p = hold(true, false, false); tick(&p, 1.0f / 60); Input n = idle(); n.ir_valid = false; calm_cpu(); for (int f = 0; f < 30; f++) { calm_cpu(); tick(&n, 1.0f / 60); }
  CHECK(fabsf((hp0 - cpu.hp) - 8.0f) < 0.01f, "a punch takes 8 hp (took %.1f)", hp0 - cpu.hp);
  CHECK(R.score - s0 == 40, "dealing damage scores 5 per hp (%d)", R.score - s0);
  /* too far away: nothing */
  run(0.6f, &n); cpu.x = 400; calm_cpu(); hp0 = cpu.hp;
  p = hold(true, false, false); tick(&p, 1.0f / 60); for (int f = 0; f < 40; f++) { calm_cpu(); tick(&n, 1.0f / 60); }
  CHECK(cpu.hp == hp0, "a punch from too far away misses");
  /* a kick is stronger */
  run(0.6f, &n); cpu.x = pl.x + 70; calm_cpu(); hp0 = cpu.hp;
  p = hold(false, true, false); tick(&p, 1.0f / 60); for (int f = 0; f < 45; f++) { calm_cpu(); tick(&n, 1.0f / 60); }
  CHECK(fabsf((hp0 - cpu.hp) - 13.0f) < 0.01f, "a kick takes 13 hp (took %.1f)", hp0 - cpu.hp);
  /* blocking cuts the damage; not blocking takes the full hit */
  run(1.0f, &n); pl.x = 300; pl.hp = 100; cpu.x = 350; calm_cpu(); begin_attack(&cpu, S_PUNCH);
  Input blk = idle(); blk.ir_valid = false; blk.one = true; for (int f = 0; f < 30; f++) tick(&blk, 1.0f / 60);
  float blocked = 100 - pl.hp;
  run(1.0f, &n); pl.x = 300; pl.hp = 100; pl.state = S_IDLE; cpu.x = 350; cpu.state = S_IDLE; calm_cpu(); begin_attack(&cpu, S_PUNCH);
  for (int f = 0; f < 30; f++) tick(&n, 1.0f / 60);
  float open = 100 - pl.hp;
  CHECK(open > 5 && blocked < open * 0.3f && blocked > 0, "blocking cuts a hit to a fraction (%.2f vs %.2f)", blocked, open);
  /* jumping over an attack */
  run(1.0f, &n); pl.x = 300; pl.hp = 100; pl.state = S_IDLE; cpu.x = 350; calm_cpu();
  Input up = idle(); up.ir_valid = false; up.up_down = true; tick(&up, 1.0f / 60);
  CHECK(pl.air, "Up jumps"); begin_attack(&cpu, S_PUNCH); for (int f = 0; f < 18; f++) tick(&n, 1.0f / 60);
  CHECK(pl.hp == 100, "an attack can't hit a jumping fighter (hp %.1f)", pl.hp);
  /* knock out the first opponent: the next one comes with more health, and you recover some */
  run(1.5f, &n); pl.x = 200; pl.hp = 60; pl.state = S_IDLE; cpu.x = 250; calm_cpu(); cpu.hp = 1; s0 = R.score;
  p = hold(true, false, false); tick(&p, 1.0f / 60); for (int f = 0; f < 20; f++) { calm_cpu(); cpu.state = cpu.hp <= 0 ? S_KO : cpu.state; tick(&n, 1.0f / 60); }
  CHECK(cpu.state == S_KO && defeated == 1, "the first fighter is knocked out (defeated %d)", defeated);
  CHECK(R.score - s0 >= 300, "a knock-out is worth 300+ (%d)", R.score - s0);
  run(2.0f, &n);
  CHECK(level == 1 && cpu.hp == 100 && cpu.state != S_KO, "fighter two arrives with 100 hp (level %d, hp %.0f)", level, cpu.hp);
  CHECK(pl.hp >= 84, "you recover 25 hp (%.0f)", pl.hp);
  /* get knocked out yourself */
  pl.hp = 1; pl.x = 300; cpu.x = 340; cpu.state = S_IDLE; begin_attack(&cpu, S_KICK);
  for (int f = 0; f < 40 && fw_phase() == PH_PLAY; f++) tick(&n, 1.0f / 60);
  CHECK(fw_phase() == PH_RESULTS, "being knocked out ends the game");
  /* win the whole gauntlet */
  begin_game(11);
  for (int fight = 0; fight < OPPONENTS && fw_phase() == PH_PLAY; fight++) {
    run(2.0f, &n); pl.x = 200; pl.state = S_IDLE; pl.hp = 100; cpu.x = 250; calm_cpu(); cpu.hp = 1;
    p = hold(true, false, false); tick(&p, 1.0f / 60); for (int f = 0; f < 20 && fw_phase() == PH_PLAY; f++) { calm_cpu(); tick(&n, 1.0f / 60); }
    run(2.0f, &n);
  }
  CHECK(fw_phase() == PH_RESULTS && defeated == OPPONENTS, "beating all five wins (defeated %d, phase %d)", defeated, (int)fw_phase());
  return finish_test("fight");
}
