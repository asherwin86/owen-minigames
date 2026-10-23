/* Records video and screenshots from inside a test run. Only built for `make captures`. Output goes to $CAPTURE_DIR
 * (default ./captures): videos/<test>.mp4 and shots/<test>_g<game>_<phase>.png. */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "harness.h"

void soft_copy_rgb(uint8_t *out);
int soft_save_png(const char *path);
int soft_width(void);

static FILE *pipe_ = NULL;
static long frame = 0, written = 0, phase_frames = 0;
static int last_phase = -1, last_game = -1, shots = 0;
static int step = 2, max_frames = 2400;
static const char *name = "test", *dir = "captures";
static uint8_t buf[1024 * 480 * 3];
static const char *PHASE[] = {"title", "menu", "instructions", "countdown", "playing", "paused", "results", "options"};

static void open_pipe(void) {
  const char *ff = getenv("FFMPEG"); if (!ff) ff = "ffmpeg";
  char cmd[1024];
  snprintf(cmd, sizeof cmd, "mkdir -p '%s/videos' '%s/shots' && '%s' -y -loglevel error -f rawvideo -pix_fmt rgb24 -s 640x480 -r 30 -i - -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 23 -movflags +faststart '%s/videos/%s.mp4'", dir, dir, ff, dir, name);
  pipe_ = popen(cmd, "w");
}

void capture_frame(void) {
  if (!name || soft_width() != 640) return;
  static int inited = 0;
  if (!inited) {
    inited = 1;
    if (getenv("CAPTURE_NAME")) name = getenv("CAPTURE_NAME");
    if (getenv("CAPTURE_DIR")) dir = getenv("CAPTURE_DIR");
    if (getenv("CAPTURE_STEP")) step = atoi(getenv("CAPTURE_STEP"));
    if (getenv("CAPTURE_MAX")) max_frames = atoi(getenv("CAPTURE_MAX"));
    open_pipe();
  }
  frame++;
  int ph = (int)fw_phase(), g = fw_current();
  if (ph != last_phase || (ph != PH_TITLE && ph != PH_MENU && g != last_game)) { phase_frames = 0; last_phase = ph; last_game = g; } else phase_frames++;
  /* one screenshot a moment after each phase begins; "playing" gets a second one a few seconds in */
  int want = (phase_frames == 18) || (ph == PH_PLAY && phase_frames == 300);
  if (want && shots < 120) {
    char path[1024];
    soft_copy_rgb(buf);
    snprintf(path, sizeof path, "%s/shots/%s_g%d_%s%s.png", dir, name, g, PHASE[ph], (ph == PH_PLAY && phase_frames == 300) ? "_later" : "");
    extern int soft_save_png(const char *); if (soft_save_png(path)) shots++;
  }
  if (pipe_ && frame % step == 0 && written < max_frames) { soft_copy_rgb(buf); fwrite(buf, 1, 640 * 480 * 3, pipe_); written++; }
}

void capture_close(void) { if (pipe_) { pclose(pipe_); pipe_ = NULL; } }
