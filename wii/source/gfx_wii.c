/* GX back end for gfx.h: 2D immediate-mode drawing plus a bitmap font, on the Wii's GPU. */
#include <gccore.h>
#include <ogc/conf.h>
#include <malloc.h>
#include <string.h>
#include <stdlib.h>
#include "gfx.h"
#include "font_data.h"

float g_screen_w = 640.0f;

#define FIFO_SIZE (256 * 1024)
static GXRModeObj *rmode;
static void *xfb[2];
static int fb = 0;
static float origin_x = 0.0f;
static GXTexObj font_tex;
static bool textured = false;

static inline void vtx(float x, float y, Color c, float u, float v) {
  GX_Position2f32(x + origin_x, y);
  GX_Color4u8((c >> 24) & 255, (c >> 16) & 255, (c >> 8) & 255, c & 255);
  GX_TexCoord2f32(u, v);
}

static void set_textured(bool on) {
  if (on == textured) return;
  textured = on;
  GX_SetTevOp(GX_TEVSTAGE0, on ? GX_MODULATE : GX_PASSCLR);
}

/* The atlas is stored as 4-bit alpha, two pixels per byte. GX wants IA4 in 8x4-pixel tiles, one byte per texel with the
 * ALPHA in the high nibble and the intensity in the low nibble (the other way round makes every glyph an opaque box:
 * found by running the game in Dolphin). So expand and re-tile it once at start-up. */
static void build_font_texture(void) {
  const int W = FONT_ATLAS_W, H = FONT_ATLAS_H;
  u8 *tex = (u8 *)memalign(32, (size_t)W * H);
  for (int y = 0; y < H; y++) {
    for (int x = 0; x < W; x++) {
      u8 byte = font_alpha4[(y * W + x) / 2];
      u8 a = (x & 1) ? (byte & 15) : (byte >> 4);
      int tile = (y / 4) * (W / 8) + (x / 8);
      tex[tile * 32 + (y % 4) * 8 + (x % 8)] = (u8)((a << 4) | 0x0F);
    }
  }
  DCFlushRange(tex, (u32)W * H);
  GX_InitTexObj(&font_tex, tex, W, H, GX_TF_IA4, GX_CLAMP, GX_CLAMP, GX_FALSE);
  GX_InitTexObjFilterMode(&font_tex, GX_LINEAR, GX_LINEAR);
  GX_LoadTexObj(&font_tex, GX_TEXMAP0);
  GX_InvalidateTexAll();
}

void gfx_init(void) {
  VIDEO_Init();
  rmode = VIDEO_GetPreferredMode(NULL);        /* 480p when the Wii is set up for it and a component cable is used, else 480i */
  if (CONF_GetAspectRatio() == CONF_ASPECT_16_9) {
    rmode->viWidth = 678;                      /* the usual widescreen setting: the same 640-wide frame, stretched by the TV */
    rmode->viXOrigin = (VI_MAX_WIDTH_NTSC - 678) / 2;
    g_screen_w = WORLD_W * (16.0f / 9.0f) / (4.0f / 3.0f);
  } else {
    g_screen_w = WORLD_W;
  }
  VIDEO_Configure(rmode);
  xfb[0] = MEM_K0_TO_K1(SYS_AllocateFramebuffer(rmode));
  xfb[1] = MEM_K0_TO_K1(SYS_AllocateFramebuffer(rmode));
  VIDEO_ClearFrameBuffer(rmode, xfb[0], COLOR_BLACK);
  VIDEO_ClearFrameBuffer(rmode, xfb[1], COLOR_BLACK);
  VIDEO_SetNextFramebuffer(xfb[fb]);
  VIDEO_SetBlack(false);
  VIDEO_Flush();
  VIDEO_WaitVSync();
  if (rmode->viTVMode & VI_NON_INTERLACE) VIDEO_WaitVSync();

  void *fifo = memalign(32, FIFO_SIZE);
  memset(fifo, 0, FIFO_SIZE);
  GX_Init(fifo, FIFO_SIZE);
  GXColor black = {0, 0, 0, 255};
  GX_SetCopyClear(black, 0x00ffffff);
  GX_SetViewport(0, 0, rmode->fbWidth, rmode->efbHeight, 0, 1);
  f32 yscale = GX_GetYScaleFactor(rmode->efbHeight, rmode->xfbHeight);
  u32 xfbHeight = GX_SetDispCopyYScale(yscale);
  GX_SetScissor(0, 0, rmode->fbWidth, rmode->efbHeight);
  GX_SetDispCopySrc(0, 0, rmode->fbWidth, rmode->efbHeight);
  GX_SetDispCopyDst(rmode->fbWidth, xfbHeight);
  GX_SetCopyFilter(rmode->aa, rmode->sample_pattern, GX_TRUE, rmode->vfilter);
  GX_SetFieldMode(rmode->field_rendering, (rmode->viHeight == 2 * rmode->xfbHeight) ? GX_ENABLE : GX_DISABLE);
  GX_SetPixelFmt(rmode->aa ? GX_PF_RGB565_Z16 : GX_PF_RGB8_Z24, GX_ZC_LINEAR);
  GX_SetCullMode(GX_CULL_NONE);
  GX_SetDispCopyGamma(GX_GM_1_0);
  GX_SetZMode(GX_FALSE, GX_ALWAYS, GX_FALSE);
  GX_SetBlendMode(GX_BM_BLEND, GX_BL_SRCALPHA, GX_BL_INVSRCALPHA, GX_LO_CLEAR);
  GX_SetColorUpdate(GX_TRUE);
  GX_SetAlphaUpdate(GX_FALSE);

  GX_ClearVtxDesc();
  GX_SetVtxDesc(GX_VA_POS, GX_DIRECT);
  GX_SetVtxDesc(GX_VA_CLR0, GX_DIRECT);
  GX_SetVtxDesc(GX_VA_TEX0, GX_DIRECT);
  GX_SetVtxAttrFmt(GX_VTXFMT0, GX_VA_POS, GX_POS_XY, GX_F32, 0);
  GX_SetVtxAttrFmt(GX_VTXFMT0, GX_VA_CLR0, GX_CLR_RGBA, GX_RGBA8, 0);
  GX_SetVtxAttrFmt(GX_VTXFMT0, GX_VA_TEX0, GX_TEX_ST, GX_F32, 0);
  GX_SetNumChans(1);
  GX_SetNumTexGens(1);
  GX_SetTexCoordGen(GX_TEXCOORD0, GX_TG_MTX2x4, GX_TG_TEX0, GX_IDENTITY);
  GX_SetTevOrder(GX_TEVSTAGE0, GX_TEXCOORD0, GX_TEXMAP0, GX_COLOR0A0);
  textured = true;                             /* force the first set_textured(false) to take effect */
  set_textured(false);

  Mtx44 proj;
  guOrtho(proj, 0, WORLD_H, 0, g_screen_w, 0, 1);
  GX_LoadProjectionMtx(proj, GX_ORTHOGRAPHIC);
  Mtx mv;
  guMtxIdentity(mv);
  GX_LoadPosMtxImm(mv, GX_PNMTX0);
  build_font_texture();
}

void gfx_begin(void) {
  origin_x = 0.0f;
  set_textured(false);
}

void gfx_end(void) {
  GX_DrawDone();
  fb ^= 1;
  GX_CopyDisp(xfb[fb], GX_TRUE);
  VIDEO_SetNextFramebuffer(xfb[fb]);
  VIDEO_Flush();
  VIDEO_WaitVSync();
}

void gfx_set_origin(float ox) { origin_x = ox; }

void gfx_rect(float x, float y, float w, float h, Color c) {
  set_textured(false);
  GX_Begin(GX_QUADS, GX_VTXFMT0, 4);
  vtx(x, y, c, 0, 0); vtx(x + w, y, c, 0, 0); vtx(x + w, y + h, c, 0, 0); vtx(x, y + h, c, 0, 0);
  GX_End();
}

void gfx_clear(Color c) { float save = origin_x; origin_x = 0; gfx_rect(-8, -8, g_screen_w + 16, WORLD_H + 16, c); origin_x = save; }

void gfx_rect_grad(float x, float y, float w, float h, Color top, Color bottom) {
  set_textured(false);
  GX_Begin(GX_QUADS, GX_VTXFMT0, 4);
  vtx(x, y, top, 0, 0); vtx(x + w, y, top, 0, 0); vtx(x + w, y + h, bottom, 0, 0); vtx(x, y + h, bottom, 0, 0);
  GX_End();
}

static int segs_for(float r) { int n = 10 + (int)(r * 0.45f); return n > 48 ? 48 : n; }

void gfx_ellipse(float cx, float cy, float rx, float ry, Color c) {
  set_textured(false);
  int n = segs_for(rx > ry ? rx : ry);
  GX_Begin(GX_TRIANGLEFAN, GX_VTXFMT0, (u16)(n + 2));
  vtx(cx, cy, c, 0, 0);
  for (int i = 0; i <= n; i++) { float a = 2.0f * PI_F * i / n; vtx(cx + cosf(a) * rx, cy + sinf(a) * ry, c, 0, 0); }
  GX_End();
}

void gfx_circle(float cx, float cy, float r, Color c) { gfx_ellipse(cx, cy, r, r, c); }

void gfx_ring(float cx, float cy, float r_in, float r_out, Color c) {
  set_textured(false);
  int n = segs_for(r_out);
  GX_Begin(GX_TRIANGLESTRIP, GX_VTXFMT0, (u16)(2 * (n + 1)));
  for (int i = 0; i <= n; i++) {
    float a = 2.0f * PI_F * i / n, co = cosf(a), si = sinf(a);
    vtx(cx + co * r_out, cy + si * r_out, c, 0, 0);
    vtx(cx + co * r_in, cy + si * r_in, c, 0, 0);
  }
  GX_End();
}

void gfx_tri(float x1, float y1, float x2, float y2, float x3, float y3, Color c) {
  set_textured(false);
  GX_Begin(GX_TRIANGLES, GX_VTXFMT0, 3);
  vtx(x1, y1, c, 0, 0); vtx(x2, y2, c, 0, 0); vtx(x3, y3, c, 0, 0);
  GX_End();
}

void gfx_quad(float x1, float y1, float x2, float y2, float x3, float y3, float x4, float y4, Color c) {
  set_textured(false);
  GX_Begin(GX_QUADS, GX_VTXFMT0, 4);
  vtx(x1, y1, c, 0, 0); vtx(x2, y2, c, 0, 0); vtx(x3, y3, c, 0, 0); vtx(x4, y4, c, 0, 0);
  GX_End();
}

void gfx_line(float x1, float y1, float x2, float y2, float t, Color c) {
  float dx = x2 - x1, dy = y2 - y1, len = sqrtf(dx * dx + dy * dy);
  if (len < 0.001f) return;
  float nx = -dy / len * t * 0.5f, ny = dx / len * t * 0.5f;
  gfx_quad(x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny, c);
}

void gfx_rrect(float x, float y, float w, float h, float r, Color c) {
  if (r > w * 0.5f) r = w * 0.5f;
  if (r > h * 0.5f) r = h * 0.5f;
  set_textured(false);
  const int arc = 6;
  GX_Begin(GX_TRIANGLEFAN, GX_VTXFMT0, (u16)(4 * (arc + 1) + 2));
  vtx(x + w * 0.5f, y + h * 0.5f, c, 0, 0);
  const float cxs[4] = {x + w - r, x + w - r, x + r, x + r};
  const float cys[4] = {y + r, y + h - r, y + h - r, y + r};
  for (int k = 0; k < 4; k++)
    for (int i = 0; i <= arc; i++) { float a = (k + (float)i / arc) * (PI_F * 0.5f) - PI_F * 0.5f; vtx(cxs[k] + cosf(a) * r, cys[k] + sinf(a) * r, c, 0, 0); }
  vtx(cxs[0], cys[0] - r, c, 0, 0);            /* close the fan on its first rim vertex (the top edge, where the arc starts) */
  GX_End();
}

float gfx_text_width(const char *s, float size) {
  float w = 0, sc = size / (float)FONT_BASE;
  for (; *s; s++) { unsigned char ch = (unsigned char)*s; if (ch >= 32 && ch < 127) w += font_advance[ch - 32] * sc; }
  return w;
}

void gfx_text(float x, float y, float size, Color c, const char *s) {
  float sc = size / (float)FONT_BASE;
  set_textured(true);
  for (; *s; s++) {
    unsigned char ch = (unsigned char)*s;
    if (ch < 32 || ch >= 127) continue;
    int idx = ch - 32, col = idx % FONT_COLS, row = idx / FONT_COLS;
    if (ch != ' ') {
      float u0 = (float)(col * FONT_CELL_W) / FONT_ATLAS_W, v0 = (float)(row * FONT_CELL_H) / FONT_ATLAS_H;
      float u1 = u0 + (float)FONT_CELL_W / FONT_ATLAS_W, v1 = v0 + (float)FONT_CELL_H / FONT_ATLAS_H;
      float w = FONT_CELL_W * sc, h = FONT_CELL_H * sc;
      GX_Begin(GX_QUADS, GX_VTXFMT0, 4);
      vtx(x, y, c, u0, v0); vtx(x + w, y, c, u1, v0); vtx(x + w, y + h, c, u1, v1); vtx(x, y + h, c, u0, v1);
      GX_End();
    }
    x += font_advance[idx] * sc;
  }
  set_textured(false);
}

void gfx_text_center(float cx, float y, float size, Color c, const char *s) { gfx_text(cx - gfx_text_width(s, size) * 0.5f, y, size, c, s); }

void gfx_text_shadow(float cx, float y, float size, Color c, const char *s) {
  float o = size * 0.07f + 1.0f;
  Color k = RGBA(0, 0, 0, 200);
  gfx_text_center(cx - o, y, size, k, s); gfx_text_center(cx + o, y, size, k, s);
  gfx_text_center(cx, y - o, size, k, s); gfx_text_center(cx, y + o, size, k, s);
  gfx_text_center(cx, y, size, c, s);
}
