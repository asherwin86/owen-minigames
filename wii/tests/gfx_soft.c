/* A software renderer for gfx.h, for the PC only. It exists so the tests can record screenshots and video of the REAL
 * game code running. It is not the Wii's GX output and not an emulator: shapes are anti-aliased differently and there
 * is no TV/video-mode effect, but the geometry, colours, layout and text all come from the same calls the Wii build makes. */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>
#include "../source/gfx.h"
#include "../source/font_data.h"
#include "harness.h"

#define MAXW 1024
#define H 480
static uint8_t px[H][MAXW][3];
static int W = 640;
static float origin_x = 0;

void soft_set_width(int w) { W = w > MAXW ? MAXW : w; }
int soft_width(void) { return W; }

static inline void blend(int x, int y, Color c, float cov) {
  if (x < 0 || y < 0 || x >= W || y >= H || cov <= 0) return;
  float a = (c & 255) / 255.0f * (cov > 1 ? 1 : cov);
  uint8_t *p = px[y][x];
  p[0] = (uint8_t)(p[0] + ((int)((c >> 24) & 255) - p[0]) * a);
  p[1] = (uint8_t)(p[1] + ((int)((c >> 16) & 255) - p[1]) * a);
  p[2] = (uint8_t)(p[2] + ((int)((c >> 8) & 255) - p[2]) * a);
}

static int finite_all(const float *v, int n) { for (int i = 0; i < n; i++) if (!isfinite(v[i])) return 0; return 1; }

/* Fills a convex polygon with 4 sub-scanlines per pixel row and exact horizontal coverage. */
static void fill_poly(const float *xs, const float *ys, int n, Color c) {
  CHECK(finite_all(xs, n) && finite_all(ys, n), "non-finite polygon coordinate");
  float miny = 1e9f, maxy = -1e9f;
  for (int i = 0; i < n; i++) { if (ys[i] < miny) miny = ys[i]; if (ys[i] > maxy) maxy = ys[i]; }
  int y0 = (int)floorf(miny), y1 = (int)floorf(maxy);
  if (y0 < 0) y0 = 0;
  if (y1 > H - 1) y1 = H - 1;
  static float cov[MAXW];
  for (int y = y0; y <= y1; y++) {
    int lo = MAXW, hi = -1;
    for (int k = 0; k < 4; k++) {
      float sy = y + (k + 0.5f) / 4.0f, xl = 1e9f, xr = -1e9f;
      for (int i = 0; i < n; i++) {
        int j = (i + 1) % n;
        float ya = ys[i], yb = ys[j];
        if ((ya <= sy && yb > sy) || (yb <= sy && ya > sy)) { float t = (sy - ya) / (yb - ya), x = xs[i] + t * (xs[j] - xs[i]); if (x < xl) xl = x; if (x > xr) xr = x; }
      }
      if (xl >= xr) continue;
      int a = (int)floorf(xl), b = (int)floorf(xr);
      if (a < 0) a = 0;
      if (b > W - 1) b = W - 1;
      if (a < lo) { for (int x = a; x < lo && x < MAXW; x++) cov[x] = 0; lo = a; }
      if (b > hi) { for (int x = hi < 0 ? a : hi + 1; x <= b; x++) cov[x] = 0; hi = b; }
      for (int x = a; x <= b; x++) { float ov = fminf(x + 1.0f, xr) - fmaxf((float)x, xl); if (ov > 0) cov[x] += ov * 0.25f; }
    }
    for (int x = lo; x <= hi; x++) blend(x, y, c, cov[x]);
  }
}

void gfx_init(void) {} void gfx_begin(void) {} void gfx_end(void) {}
void gfx_set_origin(float ox) { origin_x = ox; }
void gfx_clear(Color c) { for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) blend(x, y, WITH_ALPHA(c, 255), 1); }

void gfx_quad(float x1, float y1, float x2, float y2, float x3, float y3, float x4, float y4, Color c) {
  float xs[4] = {x1 + origin_x, x2 + origin_x, x3 + origin_x, x4 + origin_x}, ys[4] = {y1, y2, y3, y4};
  fill_poly(xs, ys, 4, c);
}
void gfx_tri(float x1, float y1, float x2, float y2, float x3, float y3, Color c) {
  float xs[3] = {x1 + origin_x, x2 + origin_x, x3 + origin_x}, ys[3] = {y1, y2, y3};
  fill_poly(xs, ys, 3, c);
}
void gfx_rect(float x, float y, float w, float h, Color c) { gfx_quad(x, y, x + w, y, x + w, y + h, x, y + h, c); }

void gfx_rect_grad(float x, float y, float w, float h, Color top, Color bottom) {
  int y0 = (int)floorf(y), y1 = (int)ceilf(y + h);
  for (int r = y0; r < y1; r++) {
    float t = h > 0 ? clampf((r + 0.5f - y) / h, 0, 1) : 0;
    Color c = RGBA((int)lerpf((top >> 24) & 255, (bottom >> 24) & 255, t), (int)lerpf((top >> 16) & 255, (bottom >> 16) & 255, t),
                   (int)lerpf((top >> 8) & 255, (bottom >> 8) & 255, t), (int)lerpf(top & 255, bottom & 255, t));
    float ya = fmaxf((float)r, y), yb = fminf(r + 1.0f, y + h);
    if (yb > ya) { float xs[4] = {x + origin_x, x + w + origin_x, x + w + origin_x, x + origin_x}, ys[4] = {ya, ya, yb, yb}; fill_poly(xs, ys, 4, c); }
  }
}

void gfx_rrect(float x, float y, float w, float h, float r, Color c) {
  if (r > w * 0.5f) r = w * 0.5f;
  if (r > h * 0.5f) r = h * 0.5f;
  enum { ARC = 6 };
  float xs[4 * (ARC + 1)], ys[4 * (ARC + 1)]; int n = 0;
  const float cxs[4] = {x + w - r, x + w - r, x + r, x + r}, cys[4] = {y + r, y + h - r, y + h - r, y + r};
  for (int k = 0; k < 4; k++) for (int i = 0; i <= ARC; i++) { float a = (k + (float)i / ARC) * (PI_F * 0.5f) - PI_F * 0.5f; xs[n] = cxs[k] + cosf(a) * r + origin_x; ys[n] = cys[k] + sinf(a) * r; n++; }
  fill_poly(xs, ys, n, c);
}

void gfx_ellipse(float cx, float cy, float rx, float ry, Color c) {
  CHECK(isfinite(cx) && isfinite(cy) && isfinite(rx) && isfinite(ry), "non-finite ellipse");
  cx += origin_x;
  float m = fminf(rx, ry);
  int x0 = (int)floorf(cx - rx - 1), x1 = (int)ceilf(cx + rx + 1), y0 = (int)floorf(cy - ry - 1), y1 = (int)ceilf(cy + ry + 1);
  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x1 > W - 1) x1 = W - 1;
  if (y1 > H - 1) y1 = H - 1;
  if (rx < 0.01f || ry < 0.01f) return;
  for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) {
    float dx = (x + 0.5f - cx) / rx, dy = (y + 0.5f - cy) / ry, q = sqrtf(dx * dx + dy * dy);
    blend(x, y, c, (1.0f - q) * m + 0.5f);
  }
}
void gfx_circle(float cx, float cy, float r, Color c) { gfx_ellipse(cx, cy, r, r, c); }

void gfx_ring(float cx, float cy, float r_in, float r_out, Color c) {
  cx += origin_x;
  int x0 = (int)floorf(cx - r_out - 1), x1 = (int)ceilf(cx + r_out + 1), y0 = (int)floorf(cy - r_out - 1), y1 = (int)ceilf(cy + r_out + 1);
  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x1 > W - 1) x1 = W - 1;
  if (y1 > H - 1) y1 = H - 1;
  for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) {
    float d = hypotf(x + 0.5f - cx, y + 0.5f - cy);
    blend(x, y, c, fminf(d - r_in, r_out - d) + 0.5f);
  }
}

void gfx_line(float x1, float y1, float x2, float y2, float t, Color c) {
  float dx = x2 - x1, dy = y2 - y1, len = sqrtf(dx * dx + dy * dy);
  if (len < 0.001f) return;
  float nx = -dy / len * t * 0.5f, ny = dx / len * t * 0.5f;
  gfx_quad(x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny, c);
}

float gfx_text_width(const char *s, float size) {
  float w = 0, sc = size / (float)FONT_BASE;
  for (; *s; s++) { unsigned char ch = (unsigned char)*s; if (ch >= 32 && ch < 127) w += font_advance[ch - 32] * sc; }
  return w;
}

static float atlas(int x, int y) {
  if (x < 0 || y < 0 || x >= FONT_ATLAS_W || y >= FONT_ATLAS_H) return 0;
  unsigned char b = font_alpha4[(y * FONT_ATLAS_W + x) / 2];
  return ((x & 1) ? (b & 15) : (b >> 4)) / 15.0f;
}

void gfx_text(float x, float y, float size, Color c, const char *s) {
  CHECK(s != NULL && isfinite(x) && isfinite(y) && isfinite(size), "bad text call");
  float sc = size / (float)FONT_BASE;
  x += origin_x;
  for (; *s; s++) {
    unsigned char ch = (unsigned char)*s;
    if (ch < 32 || ch >= 127) continue;
    int idx = ch - 32, col = idx % FONT_COLS, row = idx / FONT_COLS;
    if (ch != ' ') {
      float gw = FONT_CELL_W * sc, gh = FONT_CELL_H * sc;
      int x0 = (int)floorf(x), x1 = (int)ceilf(x + gw), y0 = (int)floorf(y), y1 = (int)ceilf(y + gh);
      for (int py = y0; py < y1; py++) for (int pxl = x0; pxl < x1; pxl++) {
        float u = (pxl + 0.5f - x) / sc - 0.5f, v = (py + 0.5f - y) / sc - 0.5f;   /* atlas texel space inside this glyph's cell */
        if (u < -0.5f || v < -0.5f || u > FONT_CELL_W || v > FONT_CELL_H) continue;
        int tx = col * FONT_CELL_W + (int)floorf(u), ty = row * FONT_CELL_H + (int)floorf(v);
        float fu = u - floorf(u), fv = v - floorf(v);
        float a = lerpf(lerpf(atlas(tx, ty), atlas(tx + 1, ty), fu), lerpf(atlas(tx, ty + 1), atlas(tx + 1, ty + 1), fu), fv);
        blend(pxl, py, c, a);
      }
    }
    x += font_advance[idx] * sc;
  }
}
void gfx_text_center(float cx, float y, float size, Color c, const char *s) { gfx_text(cx - gfx_text_width(s, size) * 0.5f, y, size, c, s); }
void gfx_text_shadow(float cx, float y, float size, Color c, const char *s) {
  float o = size * 0.07f + 1.0f; Color k = RGBA(0, 0, 0, 200);
  gfx_text_center(cx - o, y, size, k, s); gfx_text_center(cx + o, y, size, k, s); gfx_text_center(cx, y - o, size, k, s); gfx_text_center(cx, y + o, size, k, s);
  gfx_text_center(cx, y, size, c, s);
}

void soft_copy_rgb(uint8_t *out) { for (int y = 0; y < H; y++) memcpy(out + (size_t)y * W * 3, px[y], (size_t)W * 3); }

/* ---- a tiny PNG writer (stored/uncompressed deflate blocks), so no image library is needed ---- */
static uint32_t crc_table[256]; static int crc_ready = 0;
static uint32_t crc32_update(uint32_t crc, const uint8_t *d, size_t n) {
  if (!crc_ready) { for (uint32_t i = 0; i < 256; i++) { uint32_t c = i; for (int k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1; crc_table[i] = c; } crc_ready = 1; }
  crc = ~crc; for (size_t i = 0; i < n; i++) crc = crc_table[(crc ^ d[i]) & 255] ^ (crc >> 8); return ~crc;
}
static void be32(uint8_t *p, uint32_t v) { p[0] = v >> 24; p[1] = v >> 16; p[2] = v >> 8; p[3] = (uint8_t)v; }
static void chunk(FILE *f, const char *type, const uint8_t *d, uint32_t n) {
  uint8_t h[8]; be32(h, n); memcpy(h + 4, type, 4); fwrite(h, 1, 8, f);
  uint32_t crc = crc32_update(0, (const uint8_t *)type, 4); if (n) { fwrite(d, 1, n, f); crc = crc32_update(crc, d, n); }
  uint8_t c[4]; be32(c, crc); fwrite(c, 1, 4, f);
}
int soft_save_png(const char *path) {
  FILE *f = fopen(path, "wb"); if (!f) return 0;
  size_t rawn = (size_t)(W * 3 + 1) * H; uint8_t *raw = malloc(rawn);
  for (int y = 0; y < H; y++) { raw[(size_t)y * (W * 3 + 1)] = 0; memcpy(raw + (size_t)y * (W * 3 + 1) + 1, px[y], (size_t)W * 3); }
  size_t blocks = (rawn + 65534) / 65535, zn = 2 + rawn + blocks * 5 + 4; uint8_t *z = malloc(zn); size_t o = 0;
  z[o++] = 0x78; z[o++] = 0x01;
  uint32_t a = 1, b = 0; for (size_t i = 0; i < rawn; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
  for (size_t off = 0; off < rawn; off += 65535) { size_t n = rawn - off > 65535 ? 65535 : rawn - off; z[o++] = (off + n >= rawn); z[o++] = n & 255; z[o++] = n >> 8; z[o++] = ~n & 255; z[o++] = (~n >> 8) & 255; memcpy(z + o, raw + off, n); o += n; }
  be32(z + o, (b << 16) | a); o += 4;
  fwrite("\x89PNG\r\n\x1a\n", 1, 8, f);
  uint8_t ihdr[13]; be32(ihdr, W); be32(ihdr + 4, H); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  chunk(f, "IHDR", ihdr, 13); chunk(f, "IDAT", z, (uint32_t)o); chunk(f, "IEND", NULL, 0);
  fclose(f); free(raw); free(z); return 1;
}
