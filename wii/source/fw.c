#include <stdio.h>
#include <string.h>
#include "fw.h"
#include "gfx.h"
#include "audio.h"
#include "fx.h"
#include "save.h"

Round R;

static Phase phase = PH_TITLE;
static int cur = 0;                            /* the game being played / shown */
static int sel = -1;                           /* highlighted menu tile or button */
static float phase_t = 0, clock_t_ = 0;
static bool want_exit = false, new_best_flag = false, round_won = false, disconnected = false;
static int best[GAME_COUNT];
static char headline[48];
static int last_count = -1;
static Input pointer_in;                       /* last input, for drawing the cursor */

typedef struct { float x, y, w, h; const char *label; } Btn;

/* ---- small UI helpers ---- */
static void fit_text(float cx, float y, float size, float max_w, Color c, const char *s) {
  float w = gfx_text_width(s, size);
  if (w > max_w) size *= max_w / w;
  gfx_text_shadow(cx, y, size, c, s);
}

static void btn_draw(const Btn *b, bool hot, Color base) {
  gfx_rrect(b->x - (hot ? 4 : 0), b->y - (hot ? 4 : 0), b->w + (hot ? 8 : 0), b->h + (hot ? 8 : 0), 14, hot ? RGB(255, 255, 255) : RGBA(0, 0, 0, 120));
  gfx_rrect(b->x, b->y, b->w, b->h, 12, hot ? base : WITH_ALPHA(base, 200));
  gfx_text_shadow(b->x + b->w * 0.5f, b->y + b->h * 0.5f - 14, 28, RGB(255, 255, 255), b->label);
}

/* Which of n buttons is under the pointer (or chosen with the d-pad); -1 if none. Returns the index activated by A, else -1. */
static int btn_pick(const Btn *b, int n, const Input *in) {
  static float lx = -1, ly = -1;
  bool moved = (in->x != lx || in->y != ly);
  lx = in->x; ly = in->y;
  if (in->ir_valid || moved) for (int i = 0; i < n; i++) if (in_rect(in->x, in->y, b[i].x, b[i].y, b[i].w, b[i].h)) { if (sel != i) audio_sfx(SFX_TICK); sel = i; }
  if (in->down_down || in->right_down) { sel = sel < 0 ? 0 : (sel + 1) % n; audio_sfx(SFX_TICK); }
  if (in->up_down || in->left_down) { sel = sel < 0 ? n - 1 : (sel + n - 1) % n; audio_sfx(SFX_TICK); }
  if (in->a_down && sel >= 0 && sel < n) { audio_sfx(SFX_CLICK); return sel; }
  return -1;
}

static void draw_heart(float cx, float cy, float s, Color c) {
  gfx_circle(cx - s * 0.28f, cy - s * 0.12f, s * 0.32f, c);
  gfx_circle(cx + s * 0.28f, cy - s * 0.12f, s * 0.32f, c);
  gfx_tri(cx - s * 0.58f, cy - s * 0.02f, cx + s * 0.58f, cy - s * 0.02f, cx, cy + s * 0.55f, c);
}

/* ---- phase changes ---- */
static void go_menu(void) { phase = PH_MENU; phase_t = 0; sel = -1; fx_clear(); }
static void go_ready(int g) { cur = g; phase = PH_READY; phase_t = 0; sel = 0; fx_clear(); }
static void go_count(void) { phase = PH_COUNT; phase_t = 0; last_count = -1; sel = -1; fx_clear(); }

static void begin_play(void) {
  const GameDef *g = GAME_LIST[cur];
  R.score = 0; R.elapsed = 0;
  R.time_left = g->seconds > 0 ? g->seconds : -1;
  R.lives = g->lives > 0 ? g->lives : -1;
  new_best_flag = false;
  fx_clear();
  g->start();
  phase = PH_PLAY; phase_t = 0;
  audio_sfx(SFX_START);
}

void fw_init(void) {
  memset(best, 0, sizeof best);
  save_load(best, GAME_COUNT);
  phase = PH_TITLE; phase_t = 0; want_exit = false;
}

bool fw_wants_exit(void) { return want_exit; }
Phase fw_phase(void) { return phase; }
int fw_current(void) { return cur; }
int fw_best(int g) { return (g >= 0 && g < GAME_COUNT) ? best[g] : 0; }
bool fw_new_best(void) { return new_best_flag; }
void fw_open(int g) { go_ready(g); }

void fw_add_score(int d) { R.score += d; if (R.score < 0) R.score = 0; }

void fw_finish(bool won, const char *text) {
  if (phase != PH_PLAY) return;
  round_won = won;
  strncpy(headline, text, sizeof headline - 1);
  headline[sizeof headline - 1] = 0;
  if (R.score > best[cur]) { best[cur] = R.score; new_best_flag = true; save_store(best, GAME_COUNT); }
  phase = PH_RESULTS; phase_t = 0; sel = 0;
  audio_sfx(won ? SFX_WIN : SFX_LOSE);
}

void fw_lose_life(void) {
  if (R.lives < 0) return;
  if (R.lives > 0) R.lives--;
  if (R.lives == 0) fw_finish(false, "Game over!");
}

/* ---- update ---- */
static const Btn PAUSE_BTNS[3] = {{220, 190, 200, 54, "Resume"}, {220, 256, 200, 54, "Restart"}, {220, 322, 200, 54, "Menu"}};
static const Btn RESULT_BTNS[2] = {{120, 392, 190, 56, "Play again"}, {330, 392, 190, 56, "Menu"}};
static const Btn READY_BTNS[2] = {{120, 404, 190, 56, "Start!"}, {330, 404, 190, 56, "Back"}};

#define TILE_COLS 4
#define TILE_W 146.0f
#define TILE_H 112.0f
#define TILE_GAP 8.0f
static void tile_pos(int i, float *x, float *y) { *x = 16 + (i % TILE_COLS) * (TILE_W + TILE_GAP); *y = 86 + (i / TILE_COLS) * (TILE_H + 8); }
void fw_tile_center(int g, float *x, float *y) { float tx, ty; tile_pos(g, &tx, &ty); *x = tx + TILE_W * 0.5f; *y = ty + TILE_H * 0.5f; }

void fw_update(float dt, const Input *in) {
  pointer_in = *in;
  clock_t_ += dt;
  disconnected = !in->connected;
  if (disconnected) return;                    /* everything waits for the remote to come back */
  phase_t += dt;

  switch (phase) {
    case PH_TITLE:
      if (in->home_down) want_exit = true;
      else if (in->a_down) { audio_sfx(SFX_START); go_menu(); }
      break;

    case PH_MENU: {
      if (in->home_down || in->b_down) { phase = PH_TITLE; phase_t = 0; break; }
      static float lx = -1, ly = -1;
      bool moved = (in->x != lx || in->y != ly);
      lx = in->x; ly = in->y;
      if (in->ir_valid || moved) {
        for (int i = 0; i < GAME_COUNT; i++) {
          float x, y; tile_pos(i, &x, &y);
          if (in_rect(in->x, in->y, x, y, TILE_W, TILE_H)) { if (sel != i) audio_sfx(SFX_TICK); sel = i; }
        }
      }
      if (in->right_down) { sel = sel < 0 ? 0 : (sel + 1) % GAME_COUNT; audio_sfx(SFX_TICK); }
      if (in->left_down) { sel = sel < 0 ? 0 : (sel + GAME_COUNT - 1) % GAME_COUNT; audio_sfx(SFX_TICK); }
      if (in->down_down) { sel = sel < 0 ? 0 : (sel + TILE_COLS) % GAME_COUNT; audio_sfx(SFX_TICK); }
      if (in->up_down) { sel = sel < 0 ? 0 : (sel + GAME_COUNT - TILE_COLS) % GAME_COUNT; audio_sfx(SFX_TICK); }
      if (in->a_down && sel >= 0) { audio_sfx(SFX_CLICK); go_ready(sel); }
      break;
    }

    case PH_READY: {
      if (in->b_down || in->home_down) { go_menu(); break; }
      int p = btn_pick(READY_BTNS, 2, in);
      if (p == 0) go_count();
      else if (p == 1) go_menu();
      break;
    }

    case PH_COUNT: {
      int n = 3 - (int)phase_t;                /* 3,2,1 then 0 = GO */
      if (n != last_count && n >= 0) { last_count = n; audio_sfx(SFX_TICK); }
      if (phase_t >= 3.5f) begin_play();
      break;
    }

    case PH_PLAY: {
      if (in->home_down || in->plus_down) { phase = PH_PAUSE; phase_t = 0; sel = 0; break; }
      R.elapsed += dt;
      if (R.time_left >= 0) {
        float before = R.time_left;
        R.time_left -= dt;
        if (R.time_left <= 5.0f && (int)before != (int)R.time_left && R.time_left > 0) audio_sfx(SFX_TICK);
        if (R.time_left <= 0) { R.time_left = 0; fw_finish(true, "Time's up!"); break; }
      }
      GAME_LIST[cur]->update(dt, in);
      fx_update(dt);
      break;
    }

    case PH_PAUSE: {
      if (in->b_down || in->plus_down) { phase = PH_PLAY; break; }
      int p = btn_pick(PAUSE_BTNS, 3, in);
      if (p == 0) phase = PH_PLAY;
      else if (p == 1) go_count();
      else if (p == 2) go_menu();
      break;
    }

    case PH_RESULTS: {
      if (in->b_down || in->home_down) { go_menu(); break; }
      int p = btn_pick(RESULT_BTNS, 2, in);
      if (p == 0) go_count();
      else if (p == 1) go_menu();
      break;
    }
  }
}

/* ---- drawing ---- */
static void draw_pointer(void) {
  const Input *in = &pointer_in;
  if (!in->connected) return;
  float x = in->x, y = in->y;
  gfx_tri(x - 1, y - 2, x + 22, y + 18, x + 9, y + 20, RGBA(0, 0, 0, 200));
  gfx_tri(x + 1, y + 1, x + 17, y + 16, x + 8, y + 17, in->ir_valid ? RGB(255, 255, 255) : RGB(255, 220, 90));
}

static void draw_game_cursor(CursorKind k) {
  const Input *in = &pointer_in;
  if (!in->connected || k == CUR_NONE) return;
  float x = in->x, y = in->y;
  Color c = in->ir_valid ? RGB(255, 255, 255) : RGB(255, 225, 100);
  switch (k) {
    case CUR_CROSSHAIR:
      gfx_ring(x, y, 11, 14, RGBA(0, 0, 0, 170)); gfx_ring(x, y, 12, 13, c);
      gfx_rect(x - 20, y - 1, 12, 2, c); gfx_rect(x + 8, y - 1, 12, 2, c); gfx_rect(x - 1, y - 20, 2, 12, c); gfx_rect(x - 1, y + 8, 2, 12, c);
      break;
    case CUR_HAMMER: {
      float a = in->a ? 0.9f : -0.5f;                      /* the hammer swings down while A is held */
      float hx = x + cosf(a - 1.2f) * 38, hy = y + sinf(a - 1.2f) * 38;
      gfx_line(x, y, hx, hy, 8, RGB(140, 90, 40));
      gfx_quad(hx - 22, hy - 12, hx + 22, hy - 12, hx + 22, hy + 12, hx - 22, hy + 12, RGB(190, 190, 200));
      gfx_circle(x, y, 5, c);
      break;
    }
    case CUR_HAND:
      gfx_circle(x, y, 13, RGBA(0, 0, 0, 150)); gfx_circle(x, y, 10, c); gfx_circle(x, y, 4, RGB(60, 90, 160));
      break;
    case CUR_SHOVEL:
      gfx_line(x, y, x + 22, y + 30, 6, RGB(150, 100, 50));
      gfx_quad(x + 12, y + 28, x + 36, y + 28, x + 32, y + 48, x + 16, y + 48, RGB(190, 195, 205));
      gfx_circle(x, y, 5, c);
      break;
    default: break;
  }
}

static void draw_hud(void) {
  char buf[48];
  gfx_rect(0, 0, WORLD_W, 50, RGBA(0, 0, 0, 110));
  snprintf(buf, sizeof buf, "Score %d", R.score);
  gfx_text(16, 8, 30, RGB(255, 255, 255), buf);
  if (R.time_left >= 0) {
    int s = (int)(R.time_left + 0.99f);
    snprintf(buf, sizeof buf, "%d:%02d", s / 60, s % 60);
    Color c = (R.time_left <= 10 && ((int)(R.time_left * 3) & 1)) ? RGB(255, 90, 90) : RGB(255, 235, 120);
    gfx_text_center(WORLD_W * 0.5f, 8, 32, c, buf);
  }
  if (R.lives >= 0) for (int i = 0; i < R.lives; i++) draw_heart(WORLD_W - 28 - i * 38, 24, 26, RGB(255, 80, 100));
}

static void dim(float a) { gfx_rect(-8, -8, WORLD_W + 16, WORLD_H + 16, RGBA(0, 0, 0, (int)(a * 255))); }

static void draw_title(void) {
  for (int i = 0; i < 9; i++) {                /* decorative balloons drifting up */
    float ph = clock_t_ * (14 + i * 3) + i * 97;
    float x = 40 + i * 70 + sinf(clock_t_ * 0.9f + i) * 14, y = 560 - fmodf(ph, 640);
    Color c = i % 3 == 0 ? RGB(255, 100, 110) : (i % 3 == 1 ? RGB(255, 210, 80) : RGB(110, 220, 150));
    gfx_line(x, y + 30, x - 4, y + 70, 2, RGBA(255, 255, 255, 150));
    gfx_ellipse(x, y, 26, 32, c);
    gfx_ellipse(x - 8, y - 10, 6, 9, RGBA(255, 255, 255, 110));
  }
  gfx_text_shadow(WORLD_W * 0.5f, 90, 84, RGB(255, 235, 120), "Owen's");
  gfx_text_shadow(WORLD_W * 0.5f, 170, 84, RGB(255, 255, 255), "Minigames");
  gfx_text_shadow(WORLD_W * 0.5f, 270, 26, RGB(210, 235, 255), "12 games for the Wii Remote");
  if (((int)(clock_t_ * 2)) & 1) gfx_text_shadow(WORLD_W * 0.5f, 340, 40, RGB(255, 255, 255), "Press A to play");
  gfx_text_center(WORLD_W * 0.5f, 436, 20, RGB(190, 205, 235), "Press HOME to quit");
}

static void draw_menu(void) {
  gfx_text_shadow(WORLD_W * 0.5f, 14, 44, RGB(255, 255, 255), "Choose a game");
  for (int i = 0; i < GAME_COUNT; i++) {
    const GameDef *g = GAME_LIST[i];
    float x, y; tile_pos(i, &x, &y);
    bool hot = (i == sel);
    float grow = hot ? 5 : 0;
    gfx_rrect(x - grow - 3, y - grow - 3, TILE_W + 2 * grow + 6, TILE_H + 2 * grow + 6, 16, hot ? RGB(255, 255, 255) : RGBA(0, 0, 0, 110));
    gfx_rrect(x - grow, y - grow, TILE_W + 2 * grow, TILE_H + 2 * grow, 14, g->c2);
    gfx_rect_grad(x - grow + 6, y - grow + 6, TILE_W + 2 * grow - 12, 62 + grow, g->c1, g->c2);
    g->icon(x + TILE_W * 0.5f, y + 30, 40);
    fit_text(x + TILE_W * 0.5f, y + TILE_H - 46 + (hot ? 2 : 0), 20, TILE_W - 12, RGB(255, 255, 255), g->name);
    char b[24];
    if (best[i] > 0) snprintf(b, sizeof b, "Best %d", best[i]); else snprintf(b, sizeof b, "New!");
    gfx_text_center(x + TILE_W * 0.5f, y + TILE_H - 24, 16, RGB(255, 245, 190), b);
  }
  gfx_text_center(WORLD_W * 0.5f, 452, 19, RGB(200, 215, 240), "Point and press A     B: back     HOME: back");
}

static void draw_ready(void) {
  const GameDef *g = GAME_LIST[cur];
  gfx_rrect(40, 40, 560, 440, 22, RGBA(0, 0, 0, 120));
  g->icon(WORLD_W * 0.5f, 96, 88);
  gfx_text_shadow(WORLD_W * 0.5f, 134, 48, RGB(255, 255, 255), g->name);
  gfx_text_center(WORLD_W * 0.5f, 188, 22, RGB(255, 235, 150), g->tagline);
  float y = 226;
  for (int i = 0; i < 4 && g->how[i]; i++, y += 30) fit_text(WORLD_W * 0.5f, y, 21, 520, RGB(235, 242, 255), g->how[i]);
  gfx_text_center(WORLD_W * 0.5f, 352, 20, RGB(160, 235, 255), g->controls);
  char b[40];
  if (best[cur] > 0) { snprintf(b, sizeof b, "Best score: %d", best[cur]); gfx_text_center(WORLD_W * 0.5f, 376, 20, RGB(255, 245, 190), b); }
  for (int i = 0; i < 2; i++) btn_draw(&READY_BTNS[i], sel == i, i == 0 ? RGB(60, 190, 90) : RGB(90, 120, 200));
}

static void draw_count(void) {
  int n = 3 - (int)phase_t;
  char b[16];
  float frac = phase_t - (int)phase_t;
  if (n > 0) snprintf(b, sizeof b, "%d", n); else snprintf(b, sizeof b, "GO!");
  gfx_text_shadow(WORLD_W * 0.5f, 150 - frac * 10, 150 - frac * 30, n > 0 ? RGB(255, 255, 255) : RGB(120, 255, 150), b);
}

static void draw_pause(void) {
  dim(0.6f);
  gfx_text_shadow(WORLD_W * 0.5f, 110, 56, RGB(255, 255, 255), "Paused");
  for (int i = 0; i < 3; i++) btn_draw(&PAUSE_BTNS[i], sel == i, i == 0 ? RGB(60, 190, 90) : (i == 1 ? RGB(230, 160, 40) : RGB(90, 120, 200)));
}

static void draw_results(void) {
  dim(0.62f);
  char b[48];
  fit_text(WORLD_W * 0.5f, 70, 54, 600, round_won ? RGB(130, 255, 160) : RGB(255, 130, 130), headline);
  snprintf(b, sizeof b, "Score: %d", R.score);
  gfx_text_shadow(WORLD_W * 0.5f, 160, 64, RGB(255, 255, 255), b);
  if (new_best_flag) { if (((int)(clock_t_ * 3)) & 1) gfx_text_shadow(WORLD_W * 0.5f, 240, 38, RGB(255, 225, 90), "NEW BEST!"); }
  else { snprintf(b, sizeof b, "Best: %d", best[cur]); gfx_text_shadow(WORLD_W * 0.5f, 240, 34, RGB(255, 245, 190), b); }
  for (int i = 0; i < 2; i++) btn_draw(&RESULT_BTNS[i], sel == i, i == 0 ? RGB(60, 190, 90) : RGB(90, 120, 200));
}

void fw_draw(void) {
  gfx_set_origin(0);
  const GameDef *g = GAME_LIST[cur];
  if (phase == PH_TITLE || phase == PH_MENU) gfx_rect_grad(-8, -8, g_screen_w + 16, WORLD_H + 16, RGB(40, 90, 200), RGB(110, 60, 190));
  else gfx_rect_grad(-8, -8, g_screen_w + 16, WORLD_H + 16, g->c1, g->c2);
  gfx_set_origin((g_screen_w - WORLD_W) * 0.5f);

  switch (phase) {
    case PH_TITLE: draw_title(); break;
    case PH_MENU: draw_menu(); break;
    case PH_READY: draw_ready(); break;
    case PH_COUNT: draw_hud(); draw_count(); break;
    case PH_PLAY: g->draw(); fx_draw(); draw_hud(); draw_game_cursor(g->cursor); break;
    case PH_PAUSE: g->draw(); draw_hud(); draw_pause(); break;
    case PH_RESULTS: g->draw(); fx_draw(); draw_hud(); draw_results(); break;
  }
  if (phase != PH_PLAY && phase != PH_COUNT) draw_pointer();

  if (disconnected) {
    gfx_set_origin((g_screen_w - WORLD_W) * 0.5f);
    dim(0.75f);
    gfx_rrect(70, 170, 500, 140, 20, RGB(30, 40, 80));
    gfx_text_shadow(WORLD_W * 0.5f, 188, 36, RGB(255, 210, 90), "Wii Remote disconnected");
    gfx_text_center(WORLD_W * 0.5f, 242, 22, RGB(255, 255, 255), "Press the A button, or 1 and 2 together,");
    gfx_text_center(WORLD_W * 0.5f, 270, 22, RGB(255, 255, 255), "to reconnect and carry on.");
  }
}
