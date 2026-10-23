#include <signal.h>
#include <unistd.h>
#include <execinfo.h>
#include "harness.h"
#include "../source/gfx.h"
#include "../source/audio.h"
#include "../source/input.h"

int g_failures = 0, g_checks = 0;

/* Watchdog: a test that is stuck (an endless loop in a game, or in the test itself) fails with a stack trace instead of
 * hanging the whole run. TEST_TIMEOUT seconds, default 120. */
static void watchdog(int sig) {
  (void)sig;
  /* Only async-signal-safe-ish output here: a backtrace() inside an ASAN build can itself fault. */
  char msg[256];
  int n = snprintf(msg, sizeof msg, "\nWATCHDOG: test did not finish in time (phase %d, game %d, score %d, lives %d, time_left %.1f, elapsed %.1f)\n", (int)fw_phase(), fw_current(), R.score, R.lives, R.time_left, R.elapsed);
  if (write(2, msg, (size_t)n) < 0) _exit(3);
  _exit(3);
}
/* A crash prints a stack trace (on its own stack, so a stack overflow can still be reported) and fails the test. */
static void crash(int sig) {
  void *bt[40];
  int n = backtrace(bt, 40);
  fprintf(stderr, "\nCRASH: signal %d. Stack:\n", sig);
  backtrace_symbols_fd(bt, n, 2);
  _exit(4);
}
__attribute__((constructor)) static void arm_watchdog(void) {
  static char altstack[1 << 16];
  stack_t ss = {.ss_sp = altstack, .ss_size = sizeof altstack, .ss_flags = 0};
  sigaltstack(&ss, NULL);
  struct sigaction sa; memset(&sa, 0, sizeof sa);
  sa.sa_handler = crash; sa.sa_flags = SA_ONSTACK;
  sigaction(SIGSEGV, &sa, NULL); sigaction(SIGBUS, &sa, NULL); sigaction(SIGFPE, &sa, NULL); sigaction(SIGABRT, &sa, NULL);
  const char *t = getenv("TEST_TIMEOUT");
  signal(SIGALRM, watchdog);
  alarm((unsigned)(t ? atoi(t) : 120));
}
float g_screen_w = 640.0f;
static int sfx_n = 0;

/* ---- stubs for the Wii-only back ends ---- */
#ifndef CAPTURE
void gfx_init(void) {} void gfx_begin(void) {} void gfx_end(void) {}
void gfx_set_origin(float ox) { (void)ox; } void gfx_clear(Color c) { (void)c; }
void gfx_rect(float x, float y, float w, float h, Color c) { (void)x; (void)y; (void)w; (void)h; (void)c; }
void gfx_rect_grad(float x, float y, float w, float h, Color a, Color b) { (void)x; (void)y; (void)w; (void)h; (void)a; (void)b; }
void gfx_rrect(float x, float y, float w, float h, float r, Color c) { (void)x; (void)y; (void)w; (void)h; (void)r; (void)c; }
void gfx_circle(float x, float y, float r, Color c) { CHECK(r == r && x == x && y == y, "NaN circle"); (void)c; }
void gfx_ellipse(float x, float y, float rx, float ry, Color c) { CHECK(rx == rx && ry == ry && x == x && y == y, "NaN ellipse"); (void)c; }
void gfx_ring(float x, float y, float a, float b, Color c) { (void)x; (void)y; (void)a; (void)b; (void)c; }
void gfx_tri(float a, float b, float c, float d, float e, float f, Color col) { CHECK(a == a && b == b && c == c && d == d && e == e && f == f, "NaN triangle"); (void)col; }
void gfx_quad(float a, float b, float c, float d, float e, float f, float g, float h, Color col) { CHECK(a == a && b == b && c == c && d == d && e == e && f == f && g == g && h == h, "NaN quad"); (void)col; }
void gfx_line(float a, float b, float c, float d, float t, Color col) { CHECK(a == a && b == b && c == c && d == d, "NaN line"); (void)t; (void)col; }
float gfx_text_width(const char *s, float size) { return (float)strlen(s) * size * 0.55f; }
void gfx_text(float x, float y, float s, Color c, const char *t) { CHECK(t != NULL && x == x && y == y, "bad text"); (void)s; (void)c; }
void gfx_text_center(float x, float y, float s, Color c, const char *t) { gfx_text(x, y, s, c, t); }
void gfx_text_shadow(float x, float y, float s, Color c, const char *t) { gfx_text(x, y, s, c, t); }
#endif
void audio_init(void) {} void audio_music(int on) { (void)on; } void audio_shutdown(void) {}
void audio_sfx(Sfx s) { (void)s; sfx_n++; }
void input_init(float w) { (void)w; } void input_poll(Input *in) { *in = idle(); } void input_rumble(int f) { (void)f; }

int sfx_count(void) { return sfx_n; }

Input idle(void) { Input in; memset(&in, 0, sizeof in); in.connected = true; in.ir_valid = true; in.x = 320; in.y = 240; return in; }
Input at(float x, float y) { Input in = idle(); in.x = x; in.y = y; return in; }
Input press_a_at(float x, float y) { Input in = at(x, y); in.a = in.a_down = true; return in; }

#ifdef CAPTURE
void capture_frame(void); void capture_close(void);
#endif
void tick(const Input *in, float dt) {
  fw_update(dt, in);
  fw_draw();
#ifdef CAPTURE
  capture_frame();
#endif
  CHECK(R.score >= 0, "score went negative: %d", R.score);
}

void run(float seconds, const Input *in) { for (int i = 0; i < (int)(seconds * 60); i++) { tick(in, 1.0f / 60); } }

void begin_game(int idx) {
  Input i = idle();
  rng_seed(1234u + (unsigned)idx);
  fw_init();
  CHECK(fw_phase() == PH_TITLE, "starts on the title screen");
  i.a_down = true; tick(&i, 1.0f / 60);
  CHECK(fw_phase() == PH_MENU, "A on the title opens the menu");
  fw_open(idx);                                /* choosing the tile by pointer is covered in t_flow */
  CHECK(fw_phase() == PH_READY, "instructions screen");
  i = press_a_at(215, 432);                    /* the Start button */
  tick(&i, 1.0f / 60);
  CHECK(fw_phase() == PH_COUNT, "countdown starts");
  Input q = idle();
  run(3.6f, &q);
  CHECK(fw_phase() == PH_PLAY, "game %d is playing after the countdown (phase %d)", idx, (int)fw_phase());
}

int finish_test(const char *name) {
#ifdef CAPTURE
  capture_close();
#endif
  printf("%-10s %3d checks, %d failed\n", name, g_checks, g_failures);
  return g_failures ? 1 : 0;
}
