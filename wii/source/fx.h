#ifndef FX_H
#define FX_H
#include "common.h"
/* Particles and floating score popups, shared by every game. */
void fx_clear(void);
void fx_burst(float x, float y, Color c, int count);
void fx_popup(float x, float y, const char *text, Color c);
void fx_update(float dt);
void fx_draw(void);
#endif
