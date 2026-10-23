#ifndef COMMON_H
#define COMMON_H
/* Types and helpers shared by every module. Nothing in here touches libogc, so the game logic that includes it
 * also builds on a normal PC for the automated tests (see ../tests). */
#include <stdint.h>
#include <stdbool.h>
#include <math.h>

typedef uint32_t Color;                        /* 0xRRGGBBAA */
#define RGBA(r, g, b, a) ((((uint32_t)(r)) << 24) | (((uint32_t)(g)) << 16) | (((uint32_t)(b)) << 8) | ((uint32_t)(a)))
#define RGB(r, g, b) RGBA(r, g, b, 255)
#define WITH_ALPHA(c, a) (((c) & 0xFFFFFF00u) | ((uint32_t)(a)))

/* Games draw in a fixed 640x480 "world". On a 16:9 TV the framework centres that world and fills the side bars
 * with the game's background, so no game needs to know the screen shape. */
#define WORLD_W 640.0f
#define WORLD_H 480.0f
extern float g_screen_w;                       /* 640 on 4:3, ~853 on 16:9 (logical units, not pixels) */

#define PI_F 3.14159265f

/* One frame of Wii Remote state, already converted to world coordinates. */
typedef struct Input {
  bool connected;                              /* a Wii Remote is paired and talking */
  bool ir_valid;                               /* the remote can see the sensor bar right now */
  float x, y;                                  /* pointer: IR position, or a d-pad-driven cursor without IR */
  bool a, b, one, two;                         /* held */
  bool a_down, b_down;                         /* pressed this frame (never repeats while held) */
  bool one_down, two_down, plus_down, minus_down, home_down;
  bool left, right, up, down;                  /* d-pad held */
  bool left_down, right_down, up_down, down_down;   /* d-pad pressed this frame */
  float tilt;                                  /* roll from the accelerometer, -1 (left) .. 1 (right); 0 if unavailable */
  bool flick;                                  /* a sharp downward swing was just detected */
} Input;

/* Small helpers. */
static inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
static inline float lerpf(float a, float b, float t) { return a + (b - a) * t; }
static inline float sqf(float v) { return v * v; }
static inline bool in_rect(float px, float py, float x, float y, float w, float h) { return px >= x && px <= x + w && py >= y && py <= y + h; }
static inline bool in_circle(float px, float py, float cx, float cy, float r) { return sqf(px - cx) + sqf(py - cy) <= r * r; }

void rng_seed(uint32_t s);
uint32_t rng_next(void);
float frand(float lo, float hi);               /* uniform in [lo, hi) */
int irand(int n);                              /* uniform in [0, n) */
bool chance(float p);                          /* true with probability p */

#endif
