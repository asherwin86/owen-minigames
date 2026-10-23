#ifndef INPUT_H
#define INPUT_H
#include "common.h"
void input_init(float screen_w);               /* Wii Remote setup; screen_w = logical screen width for pointer mapping */
void input_poll(Input *in);                    /* call once per frame */
void input_rumble(int frames);                 /* short rumble pulse */
#endif
