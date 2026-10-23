/* ASND back end for audio.h. Every sound is synthesised at start-up (see render_*), so no audio files are needed. */
#include <gccore.h>
#include <asndlib.h>
#include <malloc.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>
#include "audio.h"

#define RATE 32000
typedef struct { float f0, f1; int ms; int wave; float vol; } Note;   /* wave: 0 square, 1 triangle, 2 noise, 3 sine */

static s16 *sfx_buf[SFX_COUNT];
static u32 sfx_bytes[SFX_COUNT];
static s16 *music_buf;
static u32 music_bytes;
static int next_voice = 1;
static bool music_on = false;

static float osc(int wave, float phase) {
  float p = phase - floorf(phase);
  switch (wave) {
    case 0: return p < 0.5f ? 1.0f : -1.0f;
    case 1: return 4.0f * fabsf(p - 0.5f) - 1.0f;
    case 3: return sinf(2.0f * 3.14159265f * p);
    default: return ((float)rand() / (float)RAND_MAX) * 2.0f - 1.0f;
  }
}

/* Renders a short sequence of notes into a new 32-byte-aligned mono 16-bit buffer. */
static s16 *render(const Note *notes, int n, u32 *bytes_out) {
  int total = 0;
  for (int i = 0; i < n; i++) total += notes[i].ms * RATE / 1000;
  u32 bytes = ((u32)total * 2 + 31) & ~31u;
  s16 *buf = (s16 *)memalign(32, bytes);
  memset(buf, 0, bytes);
  int pos = 0;
  for (int i = 0; i < n; i++) {
    int len = notes[i].ms * RATE / 1000;
    float phase = 0;
    for (int k = 0; k < len; k++, pos++) {
      float t = (float)k / (float)len;
      float f = notes[i].f0 + (notes[i].f1 - notes[i].f0) * t;
      phase += f / RATE;
      float env = (1.0f - t) * (k < 80 ? k / 80.0f : 1.0f);   /* quick attack, linear decay */
      buf[pos] = (s16)(osc(notes[i].wave, phase) * env * notes[i].vol * 30000.0f);
    }
  }
  DCFlushRange(buf, bytes);
  *bytes_out = bytes;
  return buf;
}

static void make(Sfx id, const Note *notes, int n) { sfx_buf[id] = render(notes, n, &sfx_bytes[id]); }

static const float SCALE[5] = {0, 2, 4, 7, 9};   /* major pentatonic: any run of these notes sounds happy */
static float note_hz(int degree, int octave) { return 261.63f * powf(2.0f, (SCALE[degree % 5] + 12 * (octave + degree / 5)) / 12.0f); }

static void music_cb(s32 voice) { if (music_on) ASND_AddVoice(voice, music_buf, music_bytes); }

void audio_init(void) {
  ASND_Init();
  ASND_Pause(0);
  srand(12345);
  make(SFX_CLICK, (Note[]){{900, 900, 35, 0, 0.35f}}, 1);
  make(SFX_POP, (Note[]){{900, 200, 90, 2, 0.5f}}, 1);
  make(SFX_HIT, (Note[]){{320, 110, 130, 1, 0.7f}}, 1);
  make(SFX_MISS, (Note[]){{220, 90, 220, 0, 0.35f}}, 1);
  make(SFX_GOOD, (Note[]){{660, 660, 70, 1, 0.5f}, {880, 880, 110, 1, 0.5f}}, 2);
  make(SFX_BAD, (Note[]){{160, 130, 90, 0, 0.45f}, {120, 90, 170, 0, 0.45f}}, 2);
  make(SFX_WIN, (Note[]){{523, 523, 100, 1, 0.5f}, {659, 659, 100, 1, 0.5f}, {784, 784, 100, 1, 0.5f}, {1047, 1047, 260, 1, 0.5f}}, 4);
  make(SFX_LOSE, (Note[]){{392, 392, 140, 1, 0.5f}, {330, 330, 140, 1, 0.5f}, {262, 262, 140, 1, 0.5f}, {196, 196, 320, 1, 0.5f}}, 4);
  make(SFX_TICK, (Note[]){{1300, 1300, 22, 0, 0.3f}}, 1);
  make(SFX_START, (Note[]){{440, 880, 160, 3, 0.55f}}, 1);
  make(SFX_SPLASH, (Note[]){{500, 150, 200, 2, 0.35f}}, 1);
  make(SFX_FLIP, (Note[]){{500, 700, 50, 1, 0.4f}}, 1);

  /* Music: 32 eighth-notes (8 seconds) of square-wave melody over a triangle bass, looped. */
  static const int mel[32] = {0, 2, 4, 2, 5, 4, 2, 0, 1, 3, 5, 3, 7, 5, 3, 1, 2, 4, 6, 4, 7, 6, 4, 2, 5, 4, 2, 1, 0, 2, 0, 0};
  static const int bass[8] = {0, 0, 3, 3, 4, 4, 2, 0};
  int ms = 250, per = ms * RATE / 1000;
  u32 total = 32 * per;
  music_bytes = (total * 2 + 31) & ~31u;
  music_buf = (s16 *)memalign(32, music_bytes);
  memset(music_buf, 0, music_bytes);
  for (int i = 0; i < 32; i++) {
    float fm = note_hz(mel[i], 0) * 2, fb = note_hz(bass[i / 4], -1) / 2;
    float pm = 0, pb = 0;
    for (int k = 0; k < per; k++) {
      pm += fm / RATE; pb += fb / RATE;
      float env = (1.0f - (float)k / per * 0.6f) * (k < 60 ? k / 60.0f : 1.0f);
      float duty = (pm - floorf(pm)) < 0.25f ? 1.0f : -1.0f;
      float s = duty * 0.10f * env + osc(1, pb) * 0.16f;
      music_buf[i * per + k] = (s16)(s * 30000.0f);
    }
  }
  DCFlushRange(music_buf, music_bytes);
}

void audio_sfx(Sfx s) {
  if (s < 0 || s >= SFX_COUNT || !sfx_buf[s]) return;
  ASND_SetVoice(next_voice, VOICE_MONO_16BIT, RATE, 0, sfx_buf[s], (s32)sfx_bytes[s], 255, 255, NULL);
  next_voice = next_voice >= 9 ? 1 : next_voice + 1;     /* voices 1-9 for effects, voice 0 is the music */
}

void audio_music(int on) {
  if (on && !music_on) {
    music_on = true;
    ASND_SetVoice(0, VOICE_MONO_16BIT, RATE, 0, music_buf, (s32)music_bytes, 70, 70, music_cb);
  } else if (!on && music_on) {
    music_on = false;
    ASND_StopVoice(0);
  }
}

void audio_shutdown(void) { audio_music(0); ASND_End(); }
