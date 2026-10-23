#ifndef SAVE_H
#define SAVE_H
/* Best scores. On the Wii they are kept in scores.dat next to the game if the storage can be written; any failure
 * just means scores last until the game is closed. */
void save_load(int *best, int n);
void save_store(const int *best, int n);
#endif
