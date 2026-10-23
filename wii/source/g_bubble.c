/* Bubble Pop: aim and fire bubbles; three or more of one colour in a row pop, and anything left hanging falls.
 * Clear the board before the bubbles reach the bottom. Based on js/games/bubble-shooter.js. */
#include "gl.h"
#include "games.h"

#define COLS 12
#define ROWS 12
#define D 44.0f
#define RAD 22.0f
#define X0 56.0f
#define Y0 76.0f
#define ROW_H 38.0f
#define SHOOT_X 320.0f
#define SHOOT_Y 440.0f
#define NCOL 5

static signed char grid[ROWS][COLS];
static int shift;                               /* which rows are offset by half a bubble flips each time a row is added */
static int cur_c, next_c, shots, until_row;
static float bx, by, bvx, bvy, aim;
static bool flying;
static float drop_flash;

static const Color COL[NCOL] = {RGB(240, 70, 80), RGB(70, 150, 245), RGB(250, 205, 60), RGB(90, 210, 120), RGB(190, 100, 240)};

static float cell_x(int r, int c) { return X0 + RAD + c * D + (((r + shift) & 1) ? RAD : 0); }
static float cell_y(int r) { return Y0 + RAD + r * ROW_H; }
static int cols_in(int r) { return ((r + shift) & 1) ? COLS - 1 : COLS; }

static void fill_row(int r) { for (int c = 0; c < COLS; c++) grid[r][c] = c < cols_in(r) ? (signed char)irand(NCOL) : -1; }

static void add_top_row(void) {
  for (int r = ROWS - 1; r > 0; r--) memcpy(grid[r], grid[r - 1], COLS);
  shift++;
  fill_row(0);
}

static void start(void) {
  memset(grid, -1, sizeof grid);
  shift = 0;
  for (int r = 0; r < 5; r++) fill_row(r);
  cur_c = irand(NCOL); next_c = irand(NCOL); shots = 0; until_row = 6; flying = false; aim = -PI_F / 2; drop_flash = 0;
}

static int neighbors(int r, int c, int out[6][2]) {
  int odd = (r + shift) & 1, n = 0;
  int dr[6] = {0, 0, -1, -1, 1, 1};
  int dc[6] = {-1, 1, odd ? 0 : -1, odd ? 1 : 0, odd ? 0 : -1, odd ? 1 : 0};
  for (int k = 0; k < 6; k++) {
    int rr = r + dr[k], cc = c + dc[k];
    if (rr < 0 || rr >= ROWS || cc < 0 || cc >= cols_in(rr)) continue;
    out[n][0] = rr; out[n][1] = cc; n++;
  }
  return n;
}

static int flood(int r, int c, int color, bool seen[ROWS][COLS], int list[ROWS * COLS][2]) {
  int n = 0, head = 0;
  list[n][0] = r; list[n][1] = c; n++; seen[r][c] = true;
  while (head < n) {
    int nb[6][2], k = neighbors(list[head][0], list[head][1], nb);
    head++;
    for (int i = 0; i < k; i++) {
      int rr = nb[i][0], cc = nb[i][1];
      if (seen[rr][cc] || grid[rr][cc] < 0 || (color >= 0 && grid[rr][cc] != color)) continue;
      seen[rr][cc] = true; list[n][0] = rr; list[n][1] = cc; n++;
    }
  }
  return n;
}

static void pop_cell(int r, int c, int pts) {
  fx_burst(cell_x(r, c), cell_y(r), COL[(int)grid[r][c]], 5);
  grid[r][c] = -1;
  fw_add_score(pts);
}

static bool board_empty(void) { for (int r = 0; r < ROWS; r++) for (int c = 0; c < COLS; c++) if (grid[r][c] >= 0) return false; return true; }

static void settle(void) {
  /* find the empty cell nearest to where the bubble stopped */
  int br = 0, bc = 0; float best = 1e9f;
  for (int r = 0; r < ROWS; r++) for (int c = 0; c < cols_in(r); c++) {
    if (grid[r][c] >= 0) continue;
    float d = sqf(cell_x(r, c) - bx) + sqf(cell_y(r) - by);
    if (d < best) { best = d; br = r; bc = c; }
  }
  grid[br][bc] = (signed char)cur_c;
  bool seen[ROWS][COLS]; memset(seen, 0, sizeof seen);
  static int list[ROWS * COLS][2];
  int n = flood(br, bc, cur_c, seen, list);
  if (n >= 3) {
    for (int i = 0; i < n; i++) pop_cell(list[i][0], list[i][1], 10);
    audio_sfx(SFX_POP);
    memset(seen, 0, sizeof seen);                                  /* anything not connected to the top row now falls */
    for (int c = 0; c < cols_in(0); c++) if (grid[0][c] >= 0 && !seen[0][c]) flood(0, c, -1, seen, list);
    int fell = 0;
    for (int r = 0; r < ROWS; r++) for (int c = 0; c < cols_in(r); c++) if (grid[r][c] >= 0 && !seen[r][c]) { pop_cell(r, c, 20); fell++; }
    if (fell) { audio_sfx(SFX_GOOD); char t[16]; snprintf(t, sizeof t, "+%d", fell * 20); fx_popup(WORLD_W * 0.5f - 20, 200, t, RGB(255, 235, 120)); }
  } else audio_sfx(SFX_CLICK);
  shots++; until_row--;
  if (until_row <= 0) { add_top_row(); until_row = 6; drop_flash = 0.4f; audio_sfx(SFX_MISS); }
  for (int c = 0; c < cols_in(ROWS - 1); c++) if (grid[ROWS - 1][c] >= 0) { fw_finish(false, "The bubbles got you!"); return; }
  if (board_empty()) { fw_add_score(200); fw_finish(true, "Board cleared!"); return; }
  cur_c = next_c; next_c = irand(NCOL);
}

static void update(float dt, const Input *in) {
  if (drop_flash > 0) drop_flash -= dt;
  float a = atan2f(in->y - SHOOT_Y, in->x - SHOOT_X);
  aim = clampf(a, -PI_F + 0.18f, -0.18f);
  if (!flying && in->a_down) { flying = true; bx = SHOOT_X; by = SHOOT_Y; bvx = cosf(aim) * 640; bvy = sinf(aim) * 640; audio_sfx(SFX_FLIP); }
  if (!flying) return;
  bx += bvx * dt; by += bvy * dt;
  if (bx < X0 + RAD) { bx = X0 + RAD; bvx = -bvx; }
  if (bx > X0 + COLS * D - RAD + RAD) { bx = X0 + COLS * D; bvx = -bvx; }
  bool stop = by <= Y0 + RAD;
  for (int r = 0; r < ROWS && !stop; r++) for (int c = 0; c < cols_in(r) && !stop; c++)
    if (grid[r][c] >= 0 && sqf(cell_x(r, c) - bx) + sqf(cell_y(r) - by) < sqf(D * 0.88f)) stop = true;
  if (stop) { flying = false; settle(); }
}

static void draw_bubble(float x, float y, int col) {
  gfx_circle(x, y, RAD - 1, COL[col]);
  gfx_circle(x - 6, y - 7, 6, RGBA(255, 255, 255, 120));
}

static void draw(void) {
  gfx_rect(X0 - 4, Y0 - 2, COLS * D + 8, SHOOT_Y - Y0 + 40, RGBA(0, 0, 0, 70));
  gfx_rect(X0, ROWS * ROW_H + Y0 - 6, COLS * D, 3, RGBA(255, 90, 90, drop_flash > 0 ? 255 : 130));
  for (int r = 0; r < ROWS; r++) for (int c = 0; c < cols_in(r); c++) if (grid[r][c] >= 0) draw_bubble(cell_x(r, c), cell_y(r), grid[r][c]);
  for (int i = 1; i <= 7; i++) gfx_circle(SHOOT_X + cosf(aim) * (30 + i * 26), SHOOT_Y + sinf(aim) * (30 + i * 26), 3, RGBA(255, 255, 255, 180 - i * 18));
  gfx_circle(SHOOT_X, SHOOT_Y + 8, 34, RGB(60, 70, 120));
  gfx_line(SHOOT_X, SHOOT_Y, SHOOT_X + cosf(aim) * 44, SHOOT_Y + sinf(aim) * 44, 12, RGB(190, 200, 230));
  if (!flying) draw_bubble(SHOOT_X, SHOOT_Y, cur_c); else draw_bubble(bx, by, cur_c);
  gfx_text(X0 + COLS * D + 10, 380, 18, RGB(255, 255, 255), "Next");
  draw_bubble(X0 + COLS * D + 30, 420, next_c);
  char b[32]; snprintf(b, sizeof b, "Row in %d", until_row);
  gfx_text(16, 452, 18, RGB(255, 255, 255), b);
}

static void icon(float cx, float cy, float s) {
  const Color cs[4] = {COL[0], COL[1], COL[2], COL[3]};
  for (int i = 0; i < 4; i++) gfx_circle(cx - s * 0.17f + (i % 2) * s * 0.34f, cy - s * 0.2f + (i / 2) * s * 0.3f, s * 0.17f, cs[i]);
  gfx_circle(cx, cy + s * 0.36f, s * 0.12f, COL[4]);
}

const GameDef game_bubble = {
  "Bubble Pop", "Match and pop!",
  {"Aim the cannon with the Wii Remote and press A to fire.", "Make groups of 3 or more of the same colour to pop them.", "A new row drops now and then. Don't let them reach the line!", NULL},
  "Aim: point at the screen   Fire: A", RGB(40, 60, 130), RGB(80, 50, 150), 0, 0, start, update, draw, icon, CUR_NONE};
