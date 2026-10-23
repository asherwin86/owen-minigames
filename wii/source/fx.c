#include <string.h>
#include "fx.h"
#include "gfx.h"

#define MAX_P 160
#define MAX_POP 24
typedef struct { float x, y, vx, vy, life, max, size; Color c; bool on; } Particle;
typedef struct { float x, y, life; char text[16]; Color c; bool on; } Popup;
static Particle ps[MAX_P];
static Popup pops[MAX_POP];

void fx_clear(void) { memset(ps, 0, sizeof ps); memset(pops, 0, sizeof pops); }

void fx_burst(float x, float y, Color c, int count) {
  for (int n = 0, i = 0; n < count && i < MAX_P; i++) {
    if (ps[i].on) continue;
    float a = frand(0, 2 * PI_F), sp = frand(60, 260);
    ps[i] = (Particle){x, y, cosf(a) * sp, sinf(a) * sp - 40, 0, frand(0.35f, 0.7f), frand(3, 7), c, true};
    ps[i].life = ps[i].max;
    n++;
  }
}

void fx_popup(float x, float y, const char *text, Color c) {
  for (int i = 0; i < MAX_POP; i++) {
    if (pops[i].on) continue;
    pops[i].on = true; pops[i].x = x; pops[i].y = y; pops[i].life = 0.9f; pops[i].c = c;
    strncpy(pops[i].text, text, sizeof pops[i].text - 1);
    pops[i].text[sizeof pops[i].text - 1] = 0;
    return;
  }
}

void fx_update(float dt) {
  for (int i = 0; i < MAX_P; i++) {
    if (!ps[i].on) continue;
    ps[i].life -= dt;
    if (ps[i].life <= 0) { ps[i].on = false; continue; }
    ps[i].vy += 520 * dt;
    ps[i].x += ps[i].vx * dt; ps[i].y += ps[i].vy * dt;
  }
  for (int i = 0; i < MAX_POP; i++) {
    if (!pops[i].on) continue;
    pops[i].life -= dt;
    pops[i].y -= 55 * dt;
    if (pops[i].life <= 0) pops[i].on = false;
  }
}

void fx_draw(void) {
  for (int i = 0; i < MAX_P; i++) {
    if (!ps[i].on) continue;
    float t = ps[i].life / ps[i].max;
    gfx_circle(ps[i].x, ps[i].y, ps[i].size * (0.4f + 0.6f * t), WITH_ALPHA(ps[i].c, (int)(255 * t)));
  }
  for (int i = 0; i < MAX_POP; i++) {
    if (!pops[i].on) continue;
    Color c = WITH_ALPHA(pops[i].c, pops[i].life > 0.3f ? 255 : (int)(255 * pops[i].life / 0.3f));
    gfx_text_shadow(pops[i].x, pops[i].y, 30, c, pops[i].text);
  }
}
