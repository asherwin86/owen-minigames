#ifndef GL_H
#define GL_H
/* Drawing helpers shared by several games (all built from gfx.h primitives). */
#include <stdio.h>
#include <string.h>
#include "gfx.h"
#include "input.h"
#include "audio.h"
#include "fx.h"
#include "fw.h"

static inline void draw_crosshair(float x, float y, Color c) {
  gfx_ring(x, y, 11, 14, RGBA(0, 0, 0, 170));
  gfx_ring(x, y, 12, 13, c);
  gfx_rect(x - 20, y - 1, 12, 2, c); gfx_rect(x + 8, y - 1, 12, 2, c);
  gfx_rect(x - 1, y - 20, 2, 12, c); gfx_rect(x - 1, y + 8, 2, 12, c);
}

static inline void draw_star(float cx, float cy, float r, Color c) {
  for (int i = 0; i < 10; i++) {
    float a0 = i * PI_F / 5 - PI_F / 2, a1 = (i + 1) * PI_F / 5 - PI_F / 2;
    float r0 = (i & 1) ? r * 0.45f : r, r1 = (i & 1) ? r : r * 0.45f;
    gfx_tri(cx, cy, cx + cosf(a0) * r0, cy + sinf(a0) * r0, cx + cosf(a1) * r1, cy + sinf(a1) * r1, c);
  }
}

static inline void draw_heart_shape(float cx, float cy, float s, Color c) {
  gfx_circle(cx - s * 0.28f, cy - s * 0.12f, s * 0.32f, c);
  gfx_circle(cx + s * 0.28f, cy - s * 0.12f, s * 0.32f, c);
  gfx_tri(cx - s * 0.58f, cy - s * 0.02f, cx + s * 0.58f, cy - s * 0.02f, cx, cy + s * 0.55f, c);
}

static inline void draw_balloon(float x, float y, float r, Color c) {
  gfx_line(x, y + r * 1.15f, x - r * 0.15f, y + r * 2.1f, 2, RGBA(255, 255, 255, 170));
  gfx_tri(x - r * 0.18f, y + r * 1.35f, x + r * 0.18f, y + r * 1.35f, x, y + r * 1.0f, c);
  gfx_ellipse(x, y, r * 0.85f, r, c);
  gfx_ellipse(x - r * 0.3f, y - r * 0.35f, r * 0.17f, r * 0.27f, RGBA(255, 255, 255, 120));
}

static inline void draw_bomb(float x, float y, float r) {
  gfx_circle(x, y, r, RGB(35, 35, 45));
  gfx_circle(x - r * 0.3f, y - r * 0.3f, r * 0.22f, RGBA(255, 255, 255, 90));
  gfx_line(x + r * 0.5f, y - r * 0.7f, x + r * 0.9f, y - r * 1.1f, 3, RGB(170, 140, 90));
  draw_star(x + r * 0.95f, y - r * 1.15f, r * 0.35f, RGB(255, 190, 40));
}
#endif
