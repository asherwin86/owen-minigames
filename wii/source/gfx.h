#ifndef GFX_H
#define GFX_H
#include "common.h"
/* 2D drawing on the GX pipeline. Coordinates are logical units: x grows right, y grows down. The origin offset
 * (gfx_set_origin) lets the 640x480 game world sit in the middle of a 16:9 screen. */
void gfx_init(void);                           /* video + GX setup; also sets g_screen_w from the console's aspect setting */
void gfx_begin(void);                          /* start a frame */
void gfx_end(void);                            /* finish, swap and wait for vsync */
void gfx_set_origin(float ox);                 /* shift everything drawn after this by ox */
void gfx_clear(Color c);
void gfx_rect(float x, float y, float w, float h, Color c);
void gfx_rect_grad(float x, float y, float w, float h, Color top, Color bottom);
void gfx_rrect(float x, float y, float w, float h, float r, Color c);   /* rounded rectangle */
void gfx_circle(float cx, float cy, float r, Color c);
void gfx_ellipse(float cx, float cy, float rx, float ry, Color c);
void gfx_ring(float cx, float cy, float r_in, float r_out, Color c);
void gfx_tri(float x1, float y1, float x2, float y2, float x3, float y3, Color c);
void gfx_line(float x1, float y1, float x2, float y2, float thickness, Color c);
void gfx_quad(float x1, float y1, float x2, float y2, float x3, float y3, float x4, float y4, Color c);   /* convex, clockwise or not */
float gfx_text_width(const char *s, float size);
void gfx_text(float x, float y, float size, Color c, const char *s);          /* x,y = top-left; size = line height */
void gfx_text_center(float cx, float y, float size, Color c, const char *s);
void gfx_text_shadow(float cx, float y, float size, Color c, const char *s);  /* centred with a dark outline */
#endif
