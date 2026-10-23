/* Best scores are deliberately NOT written anywhere on the Wii. The game only draws, plays sound and reads the
 * Wii Remote: it never touches the Wii's internal storage, never reloads an IOS, and never writes to the USB drive
 * while running. That leaves scores lasting only until the game is closed, which is the price of that guarantee. */
#include "save.h"
void save_load(int *best, int n) { (void)best; (void)n; }
void save_store(const int *best, int n) { (void)best; (void)n; }
