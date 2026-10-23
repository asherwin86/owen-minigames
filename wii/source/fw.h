#ifndef FW_H
#define FW_H
#include "common.h"

/* The part of every game that is the same: instructions, countdown, timer and lives, pause, results, replay and
 * return-to-menu. A game only supplies start/update/draw (see GameDef) and calls fw_add_score / fw_lose_life /
 * fw_finish. Everything it does is in world coordinates (640x480). */
typedef struct {
  int score;
  float time_left;                             /* seconds remaining; negative means the game has no clock */
  int lives;                                   /* negative means the game has no lives */
  float elapsed;                               /* seconds of play so far */
} Round;
extern Round R;

typedef enum { CUR_NONE, CUR_CROSSHAIR, CUR_HAMMER, CUR_HAND, CUR_SHOVEL } CursorKind;

/* Which Wii Remote inputs a game uses; the instruction screen lights these up on a picture of the remote. */
enum { INP_POINT = 1, INP_A = 2, INP_B = 4, INP_DPAD = 8, INP_ONE = 16, INP_TWO = 32, INP_TILT = 64, INP_SWING = 128 };

typedef struct GameDef {
  const char *name;
  const char *tagline;
  const char *how[4];                          /* up to four lines of instructions, NULL-terminated if fewer */
  const char *controls;
  Color c1, c2;                                /* background gradient, top and bottom */
  float seconds;                               /* round length; 0 = no clock */
  int lives;                                   /* starting lives; 0 = none */
  void (*start)(void);                         /* a fresh round begins (called again on every replay) */
  void (*update)(float dt, const Input *in);
  void (*draw)(void);
  void (*icon)(float cx, float cy, float s);   /* picture for the menu tile, drawn inside a box of size s */
  CursorKind cursor;                           /* what the framework draws at the pointer while playing */
  unsigned inputs;                             /* INP_* flags */
  int star2, star3;                            /* score needed for two and three stars (one star is any score above 0) */
} GameDef;

#define GAME_COUNT 12
extern const GameDef *const GAME_LIST[GAME_COUNT];

typedef enum { PH_TITLE, PH_MENU, PH_READY, PH_COUNT, PH_PLAY, PH_PAUSE, PH_RESULTS, PH_OPTIONS } Phase;

void fw_init(void);
void fw_update(float dt, const Input *in);
void fw_draw(void);
bool fw_wants_exit(void);

/* For games. */
void fw_add_score(int delta);
void fw_lose_life(void);
void fw_finish(bool won, const char *headline);

/* For tests and the menu. */
Phase fw_phase(void);
int fw_current(void);
int fw_best(int game);
bool fw_new_best(void);
int fw_stars_for(int game, int score);          /* 0..3 */
void fw_options(bool *music, bool *sfx, bool *rumble);   /* current option switches (read only) */
void fw_open(int game);                        /* jump straight to a game's instruction screen */
void fw_tile_center(int game, float *x, float *y);   /* where a game's tile is on the menu (world coordinates) */

#endif
