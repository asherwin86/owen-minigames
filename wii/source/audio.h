#ifndef AUDIO_H
#define AUDIO_H
/* Sound effects and music, all synthesised in code at start-up so the game needs no sound files. */
typedef enum { SFX_CLICK, SFX_POP, SFX_HIT, SFX_MISS, SFX_GOOD, SFX_BAD, SFX_WIN, SFX_LOSE, SFX_TICK, SFX_START, SFX_SPLASH, SFX_FLIP, SFX_COUNT } Sfx;
void audio_init(void);
void audio_sfx(Sfx s);
void audio_music(int on);
void audio_shutdown(void);                     /* stop the sound hardware cleanly before returning to the loader */
#endif
