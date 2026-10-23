#include "common.h"

static uint32_t rng_state = 0x1234567u;

void rng_seed(uint32_t s) { rng_state = s ? s : 0x1234567u; }

uint32_t rng_next(void) {                      /* xorshift32: small, fast, plenty random for games */
  uint32_t x = rng_state;
  x ^= x << 13; x ^= x >> 17; x ^= x << 5;
  return rng_state = x;
}

float frand(float lo, float hi) { return lo + (hi - lo) * ((rng_next() >> 8) / 16777216.0f); }
int irand(int n) { return n <= 0 ? 0 : (int)(rng_next() % (uint32_t)n); }
bool chance(float p) { return frand(0.0f, 1.0f) < p; }
