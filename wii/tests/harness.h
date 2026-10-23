#ifndef HARNESS_H
#define HARNESS_H
/* Test harness: the real game logic is compiled on the PC against stub graphics, sound and input, then driven
 * with scripted Wii Remote input. Each test file includes the game it checks so it can inspect its state. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../source/fw.h"
#include "../source/common.h"
#include "../source/fx.h"

extern int g_failures, g_checks;
#define CHECK(cond, ...) do { g_checks++; if (!(cond)) { g_failures++; printf("  FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

Input idle(void);                              /* a connected remote doing nothing, pointer in the middle */
Input at(float x, float y);                    /* pointer at x,y, IR valid, no buttons */
Input press_a_at(float x, float y);            /* pointer at x,y with A pressed this frame */
void tick(const Input *in, float dt);          /* fw_update + fw_draw (so drawing code is exercised too) */
void run(float seconds, const Input *in);      /* hold the same input for a while (60 fps) */
void begin_game(int idx);                      /* title -> menu -> instructions -> countdown -> playing, by pressing real buttons */
int sfx_count(void);
int finish_test(const char *name);
#endif
