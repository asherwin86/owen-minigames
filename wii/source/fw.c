#include <stdio.h>
#include <string.h>
#include "gl.h"
#include "save.h"

Round R;

/* ---------------------------------------------------------------------------------------------------------------
 * State
 * ------------------------------------------------------------------------------------------------------------- */
static Phase phase = PH_TITLE, prev_phase = PH_TITLE, options_return = PH_TITLE;
static int cur = 0;                            /* the game being played / shown */
static int sel = -1;                           /* highlighted menu tile or button; MENU_BACK / MENU_OPTIONS for the two corner buttons */
static float phase_t = 0, clock_t_ = 0, fade = 0;
static bool want_exit = false, new_best_flag = false, round_won = false, disconnected = false;
static int best[GAME_COUNT];
static float tile_hot[GAME_COUNT];             /* 0..1: how "selected" each menu tile looks, eased over time */
static char headline[48];
static int last_count = -1, stars_shown = 0;
static Input pointer_in;                       /* last input, for drawing the cursor */
static bool opt_music = true, opt_sfx = true, opt_rumble = true;

#define MENU_BACK 100
#define MENU_OPTIONS 101

typedef struct { float x, y, w, h; const char *label; } Btn;

/* ---------------------------------------------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------------------------------------------- */
static float ease_out(float t) { t = clampf(t, 0, 1); return 1.0f - (1.0f - t) * (1.0f - t); }

static void fit_text(float cx, float y, float size, float max_w, Color c, const char *s) {
  float w = gfx_text_width(s, size);
  if (w > max_w) size *= max_w / w;
  gfx_text_shadow(cx, y, size, c, s);
}

static void fit_text_plain(float cx, float y, float size, float max_w, Color c, const char *s) {
  float w = gfx_text_width(s, size);
  if (w > max_w) size *= max_w / w;
  gfx_text_center(cx, y, size, c, s);
}

/* Splits text into lines no wider than max_w. Returns the number of lines. */
#define WRAP_LEN 130
static int wrap(const char *text, float size, float max_w, char out[][WRAP_LEN], int max_lines) {
  int n = 0;
  char line[WRAP_LEN] = "";
  const char *p = text;
  while (*p && n < max_lines) {
    char word[48]; int wl = 0;
    while (*p && *p != ' ' && wl < 47) word[wl++] = *p++;
    word[wl] = 0;
    while (*p == ' ') p++;
    char trial[WRAP_LEN + 52];
    snprintf(trial, sizeof trial, "%s%s%s", line, line[0] ? " " : "", word);
    if (line[0] && gfx_text_width(trial, size) > max_w) {
      memcpy(out[n], line, WRAP_LEN); n++;
      snprintf(line, sizeof line, "%s", word);
    } else { memcpy(line, trial, WRAP_LEN); line[WRAP_LEN - 1] = 0; }
  }
  if (line[0] && n < max_lines) { memcpy(out[n], line, WRAP_LEN); n++; }
  return n;
}

/* Text whose letters bob up and down in a wave. */
static void text_wave(float cx, float y, float size, Color c, const char *s, float t) {
  float total = gfx_text_width(s, size), x = cx - total * 0.5f;
  char one[2] = {0, 0};
  for (int i = 0; s[i]; i++) {
    one[0] = s[i];
    float dy = sinf(t * 3.2f + i * 0.55f) * size * 0.07f;
    gfx_text(x + 2, y + dy + 3, size, RGBA(0, 0, 0, 150), one);
    gfx_text(x, y + dy, size, c, one);
    x += gfx_text_width(one, size);
  }
}

int fw_stars_for(int g, int score) {
  if (g < 0 || g >= GAME_COUNT || score <= 0) return 0;
  const GameDef *d = GAME_LIST[g];
  return score >= d->star3 ? 3 : (score >= d->star2 ? 2 : 1);
}

static void draw_stars(float cx, float cy, float r, float gap, int earned, int total, float pulse) {
  for (int i = 0; i < total; i++) {
    float x = cx + (i - (total - 1) * 0.5f) * gap;
    if (i < earned) { draw_star(x, cy + 1.5f, r * 1.12f, RGBA(0, 0, 0, 110)); draw_star(x, cy, r * (1.0f + 0.12f * pulse), RGB(255, 215, 60)); }
    else draw_star(x, cy, r, RGBA(255, 255, 255, 55));
  }
}

static void btn_draw(const Btn *b, bool hot, Color base) {
  float pop = hot ? 3.0f + sinf(clock_t_ * 8) * 1.0f : 0;
  gfx_rrect(b->x - pop - 3, b->y - pop - 3, b->w + 2 * pop + 6, b->h + 2 * pop + 6, 16, hot ? RGB(255, 255, 255) : RGBA(0, 0, 0, 120));
  gfx_rrect(b->x - pop, b->y - pop, b->w + 2 * pop, b->h + 2 * pop, 13, hot ? base : WITH_ALPHA(base, 210));
  gfx_rect_grad(b->x - pop + 6, b->y - pop + 4, b->w + 2 * pop - 12, (b->h + 2 * pop) * 0.42f, RGBA(255, 255, 255, 60), RGBA(255, 255, 255, 0));
  float size = b->h > 48 ? 30 : 24;
  fit_text(b->x + b->w * 0.5f, b->y + b->h * 0.5f - size * 0.5f - 2, size, b->w - 16, RGB(255, 255, 255), b->label);
}

/* Which of n buttons is under the pointer (or chosen with the d-pad), and which was activated by A (else -1). */
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

static void dim(float a) { gfx_rect(-8, -8, WORLD_W + 16, WORLD_H + 16, RGBA(0, 0, 0, (int)(a * 255))); }

static void panel(float x, float y, float w, float h) {
  gfx_rrect(x - 4, y - 4, w + 8, h + 8, 26, RGBA(0, 0, 0, 120));
  gfx_rrect(x, y, w, h, 22, RGBA(18, 24, 56, 235));
  gfx_rect_grad(x + 8, y + 6, w - 16, h * 0.18f, RGBA(255, 255, 255, 40), RGBA(255, 255, 255, 0));
}

/* A drifting field of soft shapes behind the menus. */
static void draw_backdrop_shapes(float t) {
  for (int i = 0; i < 14; i++) {
    float x = fmodf(i * 97.0f + t * (6 + (i % 5) * 3), WORLD_W + 120) - 60;
    float y = 40 + fmodf(i * 61.0f, 420) + sinf(t * 0.6f + i) * 14;
    float r = 18 + (i % 4) * 12;
    Color c = RGBA(255, 255, 255, 14 + (i % 3) * 6);
    if (i % 2) gfx_circle(x, y, r, c); else gfx_rrect(x - r, y - r, r * 2, r * 2, r * 0.4f, c);
  }
}

/* A Wii Remote picture with the buttons a game uses glowing. */
static void draw_remote(float cx, float cy, float s, unsigned used, float t) {
  float pulse = 0.5f + 0.5f * sinf(t * 6);
  Color hot = RGB(255, (int)(170 + 60 * pulse), 40), idle_c = RGB(150, 155, 170), body = RGB(238, 240, 246);
  if (used & INP_POINT) {                                        /* IR rays going up to the screen */
    for (int i = -1; i <= 1; i++) for (int k = 0; k < 3; k++) {
      float fy = cy - 92 * s - k * 12 * s - fmodf(t * 40, 12) * s, fx = cx + i * (6 + k * 7) * s;
      gfx_circle(fx, fy, 2.2f * s, RGBA(255, 220, 90, 220 - k * 60));
    }
  }
  if (used & INP_TILT) { gfx_tri(cx - 40 * s, cy - 6 * s, cx - 30 * s, cy - 16 * s, cx - 30 * s, cy + 4 * s, hot); gfx_tri(cx + 40 * s, cy - 6 * s, cx + 30 * s, cy - 16 * s, cx + 30 * s, cy + 4 * s, hot); }
  if (used & INP_SWING) { float o = sinf(t * 7) * 6 * s; gfx_line(cx + 38 * s, cy - 50 * s + o, cx + 38 * s, cy + 6 * s + o, 4 * s, hot); gfx_tri(cx + 30 * s, cy + 6 * s + o, cx + 46 * s, cy + 6 * s + o, cx + 38 * s, cy + 20 * s + o, hot); }
  gfx_rrect(cx - 23 * s, cy - 82 * s, 46 * s, 164 * s, 13 * s, RGBA(0, 0, 0, 90));
  gfx_rrect(cx - 21 * s, cy - 84 * s, 42 * s, 164 * s, 12 * s, body);
  /* d-pad */
  Color dp = (used & INP_DPAD) ? hot : idle_c;
  gfx_rect(cx - 13 * s, cy - 60 * s, 26 * s, 9 * s, dp); gfx_rect(cx - 4.5f * s, cy - 69 * s, 9 * s, 27 * s, dp);
  /* A, minus, home, plus */
  gfx_circle(cx, cy - 22 * s, 10 * s, (used & INP_A) ? hot : idle_c);
  gfx_text_center(cx, cy - 22 * s - 9 * s, 16 * s, RGB(255, 255, 255), "A");
  gfx_circle(cx - 12 * s, cy + 2 * s, 3.6f * s, idle_c); gfx_circle(cx, cy + 2 * s, 3.6f * s, idle_c); gfx_circle(cx + 12 * s, cy + 2 * s, 3.6f * s, idle_c);
  /* 1 and 2 */
  gfx_circle(cx, cy + 34 * s, 8 * s, (used & INP_ONE) ? hot : idle_c); gfx_text_center(cx, cy + 34 * s - 8 * s, 14 * s, RGB(255, 255, 255), "1");
  gfx_circle(cx, cy + 58 * s, 8 * s, (used & INP_TWO) ? hot : idle_c); gfx_text_center(cx, cy + 58 * s - 8 * s, 14 * s, RGB(255, 255, 255), "2");
  /* B trigger on the back, drawn as a tab on the side */
  gfx_rrect(cx + 20 * s, cy - 40 * s, 10 * s, 42 * s, 5 * s, (used & INP_B) ? hot : RGB(190, 195, 210));
  gfx_text_center(cx + 25 * s, cy - 40 * s + 8 * s, 14 * s, RGB(255, 255, 255), "B");
}

/* ---------------------------------------------------------------------------------------------------------------
 * Phase changes
 * ------------------------------------------------------------------------------------------------------------- */
static void apply_options(void) { audio_set_enabled(opt_sfx, opt_music); input_set_rumble(opt_rumble); }

static void go_title(void) { phase = PH_TITLE; phase_t = 0; sel = 0; }
static void go_menu(void) { phase = PH_MENU; phase_t = 0; sel = -1; fx_clear(); }
static void go_ready(int g) { cur = g; phase = PH_READY; phase_t = 0; sel = 0; fx_clear(); }
static void go_count(void) { phase = PH_COUNT; phase_t = 0; last_count = -1; sel = -1; fx_clear(); }
static void go_options(Phase back) { options_return = back; phase = PH_OPTIONS; phase_t = 0; sel = 0; }

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
  memset(tile_hot, 0, sizeof tile_hot);
  save_load(best, GAME_COUNT);
  opt_music = opt_sfx = opt_rumble = true;
  apply_options();
  phase = prev_phase = PH_TITLE; phase_t = 0; want_exit = false; sel = 0; fade = 1;
}

bool fw_wants_exit(void) { return want_exit; }
Phase fw_phase(void) { return phase; }
int fw_current(void) { return cur; }
int fw_best(int g) { return (g >= 0 && g < GAME_COUNT) ? best[g] : 0; }
bool fw_new_best(void) { return new_best_flag; }
void fw_open(int g) { go_ready(g); }
void fw_options(bool *m, bool *s, bool *r) { if (m) *m = opt_music; if (s) *s = opt_sfx; if (r) *r = opt_rumble; }

void fw_add_score(int d) { R.score += d; if (R.score < 0) R.score = 0; }

void fw_finish(bool won, const char *text) {
  if (phase != PH_PLAY) return;
  round_won = won;
  strncpy(headline, text, sizeof headline - 1);
  headline[sizeof headline - 1] = 0;
  if (R.score > best[cur]) { best[cur] = R.score; new_best_flag = true; save_store(best, GAME_COUNT); }
  phase = PH_RESULTS; phase_t = 0; sel = 0; stars_shown = 0;
  audio_sfx(won ? SFX_WIN : SFX_LOSE);
}

void fw_lose_life(void) {
  if (R.lives < 0) return;
  if (R.lives > 0) R.lives--;
  if (R.lives == 0) fw_finish(false, "Game over!");
}

/* ---------------------------------------------------------------------------------------------------------------
 * Layout
 * ------------------------------------------------------------------------------------------------------------- */
static const Btn TITLE_BTNS[2] = {{210, 316, 220, 64, "Play"}, {245, 394, 150, 46, "Options"}};
static const Btn PAUSE_BTNS[3] = {{220, 196, 200, 54, "Resume"}, {220, 260, 200, 54, "Restart"}, {220, 324, 200, 54, "Menu"}};
static const Btn RESULT_BTNS[2] = {{120, 392, 190, 56, "Play again"}, {330, 392, 190, 56, "Menu"}};
static const Btn READY_BTNS[2] = {{120, 404, 190, 56, "Start!"}, {330, 404, 190, 56, "Back"}};
static const Btn MENU_TOP[2] = {{14, 10, 96, 36, "Back"}, {530, 10, 96, 36, "Options"}};
static Btn OPTION_BTNS[4] = {{150, 130, 340, 56, "Music"}, {150, 198, 340, 56, "Sound"}, {150, 266, 340, 56, "Rumble"}, {220, 346, 200, 54, "Back"}};

#define TILE_COLS 4
#define TILE_W 146.0f
#define TILE_H 112.0f
#define TILE_GAP 8.0f
static void tile_pos(int i, float *x, float *y) { *x = 16 + (i % TILE_COLS) * (TILE_W + TILE_GAP); *y = 56 + (i / TILE_COLS) * (TILE_H + 8); }
void fw_tile_center(int g, float *x, float *y) { float tx, ty; tile_pos(g, &tx, &ty); *x = tx + TILE_W * 0.5f; *y = ty + TILE_H * 0.5f; }

/* ---------------------------------------------------------------------------------------------------------------
 * Update
 * ------------------------------------------------------------------------------------------------------------- */
void fw_update(float dt, const Input *in) {
  pointer_in = *in;
  clock_t_ += dt;
  if (phase != prev_phase) { fade = 1.0f; prev_phase = phase; }
  if (fade > 0) fade -= dt * 4.0f;
  disconnected = !in->connected;
  if (disconnected) return;                    /* everything waits for the remote to come back */
  phase_t += dt;
  for (int i = 0; i < GAME_COUNT; i++) tile_hot[i] += ((i == sel ? 1.0f : 0.0f) - tile_hot[i]) * clampf(dt * 14, 0, 1);

  switch (phase) {
    case PH_TITLE: {
      if (in->home_down) { want_exit = true; break; }
      int p = btn_pick(TITLE_BTNS, 2, in);
      if (p == 0) { audio_sfx(SFX_START); go_menu(); }
      else if (p == 1) go_options(PH_TITLE);
      break;
    }

    case PH_MENU: {
      if (in->home_down || in->b_down) { go_title(); break; }
      static float lx = -1, ly = -1;
      bool moved = (in->x != lx || in->y != ly);
      lx = in->x; ly = in->y;
      if (in->ir_valid || moved) {
        int hover = -1;
        for (int i = 0; i < GAME_COUNT; i++) {
          float x, y; tile_pos(i, &x, &y);
          if (in_rect(in->x, in->y, x, y, TILE_W, TILE_H)) hover = i;
        }
        if (in_rect(in->x, in->y, MENU_TOP[0].x, MENU_TOP[0].y, MENU_TOP[0].w, MENU_TOP[0].h)) hover = MENU_BACK;
        if (in_rect(in->x, in->y, MENU_TOP[1].x, MENU_TOP[1].y, MENU_TOP[1].w, MENU_TOP[1].h)) hover = MENU_OPTIONS;
        if (hover >= 0 && hover != sel) audio_sfx(SFX_TICK);
        if (hover >= 0) sel = hover;
        else if (in->ir_valid) sel = -1;
      }
      int base = (sel >= 0 && sel < GAME_COUNT) ? sel : -1;
      if (in->right_down) { sel = base < 0 ? 0 : (base + 1) % GAME_COUNT; audio_sfx(SFX_TICK); }
      if (in->left_down) { sel = base < 0 ? 0 : (base + GAME_COUNT - 1) % GAME_COUNT; audio_sfx(SFX_TICK); }
      if (in->down_down) { sel = base < 0 ? 0 : (base + TILE_COLS) % GAME_COUNT; audio_sfx(SFX_TICK); }
      if (in->up_down) { sel = base < 0 ? 0 : (base + GAME_COUNT - TILE_COLS) % GAME_COUNT; audio_sfx(SFX_TICK); }
      if (in->a_down && sel >= 0) {
        audio_sfx(SFX_CLICK);
        if (sel == MENU_BACK) go_title();
        else if (sel == MENU_OPTIONS) go_options(PH_MENU);
        else go_ready(sel);
      }
      break;
    }

    case PH_OPTIONS: {
      if (in->b_down || in->home_down) { if (options_return == PH_MENU) go_menu(); else go_title(); break; }
      int p = btn_pick(OPTION_BTNS, 4, in);
      if (p == 0) { opt_music = !opt_music; apply_options(); }
      else if (p == 1) { opt_sfx = !opt_sfx; apply_options(); audio_sfx(SFX_GOOD); }
      else if (p == 2) { opt_rumble = !opt_rumble; apply_options(); input_rumble(12); }
      else if (p == 3) { if (options_return == PH_MENU) go_menu(); else go_title(); }
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
      /* the stars pop in one at a time after the score has counted up */
      int want = fw_stars_for(cur, R.score);
      int showing = phase_t < 1.1f ? 0 : (int)((phase_t - 1.1f) / 0.35f) + 1;
      if (showing > want) showing = want;
      if (showing > stars_shown) { stars_shown = showing; audio_sfx(SFX_GOOD); }
      if (in->b_down || in->home_down) { go_menu(); break; }
      int p = btn_pick(RESULT_BTNS, 2, in);
      if (p == 0) go_count();
      else if (p == 1) go_menu();
      break;
    }
  }
}

/* ---------------------------------------------------------------------------------------------------------------
 * Drawing
 * ------------------------------------------------------------------------------------------------------------- */
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

static void draw_title(void) {
  draw_backdrop_shapes(clock_t_);
  for (int i = 0; i < GAME_COUNT; i++) {                       /* every game's icon orbits behind the logo */
    float a = i * 2 * PI_F / GAME_COUNT + clock_t_ * 0.28f;
    float x = WORLD_W * 0.5f + cosf(a) * 290, y = 150 + sinf(a) * 112 + sinf(clock_t_ * 2 + i) * 5;
    gfx_circle(x, y, 28, RGBA(255, 255, 255, 30));
    gfx_ring(x, y, 26.5f, 29, RGBA(255, 255, 255, 60));
    GAME_LIST[i]->icon(x, y, 36);
  }
  text_wave(WORLD_W * 0.5f, 58, 76, RGB(255, 235, 120), "Owen's", clock_t_);
  text_wave(WORLD_W * 0.5f, 134, 76, RGB(255, 255, 255), "Minigames", clock_t_ + 1.3f);
  gfx_text_shadow(WORLD_W * 0.5f, 244, 26, RGB(210, 235, 255), "12 games for the Wii Remote");
  for (int i = 0; i < 2; i++) btn_draw(&TITLE_BTNS[i], sel == i, i == 0 ? RGB(60, 190, 90) : RGB(90, 120, 200));
  if (pointer_in.connected && !pointer_in.ir_valid) gfx_text_center(WORLD_W * 0.5f, 452, 17, RGB(255, 225, 120), "No sensor bar: the +Control Pad moves the cursor, A clicks     HOME: quit");
  else gfx_text_center(WORLD_W * 0.5f, 452, 18, RGB(190, 205, 235), "Point and press A     HOME: quit");
}

static void draw_menu(void) {
  draw_backdrop_shapes(clock_t_);
  gfx_text_shadow(WORLD_W * 0.5f, 6, 40, RGB(255, 255, 255), "Choose a game");
  btn_draw(&MENU_TOP[0], sel == MENU_BACK, RGB(90, 120, 200));
  btn_draw(&MENU_TOP[1], sel == MENU_OPTIONS, RGB(90, 120, 200));
  for (int i = 0; i < GAME_COUNT; i++) {
    const GameDef *g = GAME_LIST[i];
    float x, y; tile_pos(i, &x, &y);
    float hot = tile_hot[i];
    float grow = 5.0f * hot;
    float bob = sinf(clock_t_ * 7) * 2.0f * hot;
    gfx_rrect(x - grow - 3, y - grow - 3 + bob, TILE_W + 2 * grow + 6, TILE_H + 2 * grow + 6, 17, hot > 0.5f ? RGB(255, 255, 255) : RGBA(0, 0, 0, 110));
    gfx_rrect(x - grow, y - grow + bob, TILE_W + 2 * grow, TILE_H + 2 * grow, 14, g->c2);
    gfx_rect_grad(x - grow + 6, y - grow + 6 + bob, TILE_W + 2 * grow - 12, 62 + grow, g->c1, g->c2);
    g->icon(x + TILE_W * 0.5f, y + 30 + bob, 40 + 14 * hot);
    fit_text(x + TILE_W * 0.5f, y + TILE_H - 46 + bob, 20, TILE_W - 12, RGB(255, 255, 255), g->name);
    draw_stars(x + TILE_W * 0.5f, y + TILE_H - 17 + bob, 8, 20, fw_stars_for(i, best[i]), 3, hot);
  }
  /* info strip for the highlighted game */
  gfx_rrect(16, 446, 608, 30, 12, RGBA(0, 0, 0, 130));
  if (sel >= 0 && sel < GAME_COUNT) {
    char b[160];
    if (best[sel] > 0) snprintf(b, sizeof b, "%s   (Best %d)", GAME_LIST[sel]->tagline, best[sel]);
    else snprintf(b, sizeof b, "%s", GAME_LIST[sel]->tagline);
    fit_text_plain(WORLD_W * 0.5f, 450, 20, 590, RGB(255, 245, 190), b);
  } else gfx_text_center(WORLD_W * 0.5f, 450, 19, RGB(200, 215, 240), "Point at a game and press A     B: back");
}

static void draw_ready(void) {
  const GameDef *g = GAME_LIST[cur];
  panel(24, 22, 592, 372);
  gfx_circle(84, 78, 44, WITH_ALPHA(g->c2, 235)); gfx_ring(84, 78, 42, 46, RGBA(255, 255, 255, 120));
  g->icon(84, 78, 62);
  fit_text(375, 28, 44, 440, RGB(255, 255, 255), g->name);
  gfx_text_center(375, 80, 22, RGB(255, 235, 150), g->tagline);
  draw_stars(540, 112, 12, 30, fw_stars_for(cur, best[cur]), 3, 0);
  if (best[cur] > 0) { char b[32]; snprintf(b, sizeof b, "Best %d", best[cur]); gfx_text_center(540, 122, 17, RGB(255, 245, 190), b); }
  gfx_rect(40, 126, 560, 2, RGBA(255, 255, 255, 40));
  draw_remote(98, 268, 0.95f, g->inputs, phase_t);
  float y = 138;
  for (int i = 0; i < 4 && g->how[i]; i++) {
    char lines[3][WRAP_LEN];
    int n = wrap(g->how[i], 20, 376, lines, 3);
    gfx_circle(206, y + 14, 12, RGB(90, 120, 220)); gfx_text_center(206, y + 1, 18, RGB(255, 255, 255), (char[]){(char)('1' + i), 0});
    for (int k = 0; k < n; k++) gfx_text(226, y + k * 23, 20, RGB(235, 242, 255), lines[k]);
    y += n * 23 + 10;
  }
  fit_text_plain(WORLD_W * 0.5f + 40, 358, 17, 500, RGB(160, 235, 255), g->controls);
  if (pointer_in.connected && !pointer_in.ir_valid && (g->inputs & INP_POINT)) fit_text_plain(WORLD_W * 0.5f, 376, 15, 540, RGB(255, 225, 120), "No sensor bar? Use the +Control Pad to move the cursor, and A to click.");
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
  panel(150, 56, 340, 346);
  gfx_text_shadow(WORLD_W * 0.5f, 66, 52, RGB(255, 255, 255), "Paused");
  fit_text_plain(WORLD_W * 0.5f, 138, 22, 300, RGB(255, 235, 150), GAME_LIST[cur]->name);
  fit_text_plain(WORLD_W * 0.5f, 164, 16, 300, RGB(160, 235, 255), GAME_LIST[cur]->controls);
  for (int i = 0; i < 3; i++) btn_draw(&PAUSE_BTNS[i], sel == i, i == 0 ? RGB(60, 190, 90) : (i == 1 ? RGB(230, 160, 40) : RGB(90, 120, 200)));
}

static void draw_confetti(float t) {
  for (int i = 0; i < 44; i++) {
    float x = WORLD_W * 0.5f + sinf(i * 12.9f) * 310 + sinf(t * 2 + i) * 18;
    float y = fmodf(t * (70 + (i % 7) * 18) + i * 53.0f, 540) - 30;
    static const Color C[5] = {RGB(255, 90, 100), RGB(255, 215, 60), RGB(90, 220, 140), RGB(100, 170, 255), RGB(210, 120, 255)};
    float w = 7 + (i % 3) * 3, h = 4 + (i % 2) * 3, sk = sinf(t * 6 + i) * w * 0.5f;
    gfx_quad(x - w + sk, y - h, x + w + sk, y - h, x + w - sk, y + h, x - w - sk, y + h, C[i % 5]);
  }
}

static void draw_results(void) {
  dim(0.62f);
  int earned = fw_stars_for(cur, R.score);
  if (new_best_flag || earned == 3) draw_confetti(phase_t);
  panel(90, 30, 460, 340);
  fit_text(WORLD_W * 0.5f, 44, 54, 420, round_won ? RGB(130, 255, 160) : RGB(255, 130, 130), headline);
  for (int i = 0; i < 3; i++) {                              /* big stars, popping in */
    float x = WORLD_W * 0.5f + (i - 1) * 96, ts = 1.1f + i * 0.35f;
    if (i < earned && phase_t >= ts) {
      float pop = clampf((phase_t - ts) * 4, 0, 1), sc = 1.0f + 0.55f * (1.0f - pop) * (1.0f - pop);
      draw_star(x, 144 + 2, 40 * sc * 1.1f, RGBA(0, 0, 0, 110)); draw_star(x, 144, 40 * sc, RGB(255, 215, 60));
    } else draw_star(x, 144, 38, RGBA(255, 255, 255, 50));
  }
  char b[48];
  int shown = (int)(R.score * ease_out(phase_t / 1.0f));
  snprintf(b, sizeof b, "%d", shown);
  gfx_text_shadow(WORLD_W * 0.5f, 196, 70, RGB(255, 255, 255), b);
  gfx_text_center(WORLD_W * 0.5f, 270, 20, RGB(190, 205, 235), "score");
  if (new_best_flag) { if (((int)(clock_t_ * 3)) & 1) gfx_text_shadow(WORLD_W * 0.5f, 304, 34, RGB(255, 225, 90), "NEW BEST!"); }
  else { snprintf(b, sizeof b, "Best: %d", best[cur]); gfx_text_shadow(WORLD_W * 0.5f, 304, 30, RGB(255, 245, 190), b); }
  for (int i = 0; i < 2; i++) btn_draw(&RESULT_BTNS[i], sel == i, i == 0 ? RGB(60, 190, 90) : RGB(90, 120, 200));
}

static void draw_options(void) {
  draw_backdrop_shapes(clock_t_);
  panel(110, 36, 420, 384);
  gfx_text_shadow(WORLD_W * 0.5f, 52, 50, RGB(255, 255, 255), "Options");
  const char *names[3] = {"Music", "Sound effects", "Rumble"};
  bool on[3] = {opt_music, opt_sfx, opt_rumble};
  for (int i = 0; i < 3; i++) {
    const Btn *b = &OPTION_BTNS[i];
    char label[48]; snprintf(label, sizeof label, "%s: %s", names[i], on[i] ? "ON" : "OFF");
    Btn tmp = {b->x, b->y, b->w, b->h, label};
    btn_draw(&tmp, sel == i, on[i] ? RGB(60, 170, 100) : RGB(150, 70, 80));
  }
  btn_draw(&OPTION_BTNS[3], sel == 3, RGB(90, 120, 200));
}

void fw_draw(void) {
  gfx_set_origin(0);
  const GameDef *g = GAME_LIST[cur];
  if (phase == PH_TITLE || phase == PH_MENU || phase == PH_OPTIONS) {
    gfx_rect_grad(-8, -8, g_screen_w + 16, WORLD_H + 16, RGB(40, 90, 200), RGB(110, 60, 190));
    for (int i = 0; i < 24; i++) gfx_rect(-8, (float)i * 20 + fmodf(clock_t_ * 8, 20), g_screen_w + 16, 1, RGBA(255, 255, 255, 10));
  } else gfx_rect_grad(-8, -8, g_screen_w + 16, WORLD_H + 16, g->c1, g->c2);
  gfx_set_origin((g_screen_w - WORLD_W) * 0.5f);

  switch (phase) {
    case PH_TITLE: draw_title(); break;
    case PH_MENU: draw_menu(); break;
    case PH_OPTIONS: draw_options(); break;
    case PH_READY: draw_ready(); break;
    case PH_COUNT: draw_hud(); draw_count(); break;
    case PH_PLAY: g->draw(); fx_draw(); draw_hud(); draw_game_cursor(g->cursor); break;
    case PH_PAUSE: g->draw(); draw_hud(); draw_pause(); break;
    case PH_RESULTS: g->draw(); fx_draw(); draw_hud(); draw_results(); break;
  }
  if (fade > 0) { gfx_set_origin(0); gfx_rect(-8, -8, g_screen_w + 16, WORLD_H + 16, RGBA(0, 0, 0, (int)(255 * clampf(fade, 0, 1) * 0.85f))); gfx_set_origin((g_screen_w - WORLD_W) * 0.5f); }
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
