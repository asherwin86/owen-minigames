# Host tests: compiles the real game code with stub graphics/sound/input and runs scripted play.   make test
CC      ?= gcc
CFLAGS  := -std=gnu11 -O1 -g -Wall -Wextra -Wno-unused-function -Wno-missing-field-initializers -fsanitize=address,undefined -fno-omit-frame-pointer -rdynamic -I../source
GAMES   := balloon target whack fruit memory dodge fishing bubble racing treasure gun fight
GSRC    := $(addprefix ../source/g_,$(addsuffix .c,$(GAMES)))
CORE    := ../source/util.c ../source/fw.c ../source/fx.c ../source/games.c ../source/save_none.c harness.c
BIN     := build
# The address sanitizer in Ubuntu 20.04's GCC 9 crashes at start-up on kernels with high-entropy ASLR (WSL2's 6.x) about
# a third of the time, before any game code runs. Disabling address randomisation for the test processes avoids it.
RUN     := $(shell setarch $$(uname -m) -R true 2>/dev/null && echo "setarch $$(uname -m) -R")

.PHONY: test clean
test: $(addprefix $(BIN)/t_,$(GAMES)) $(BIN)/t_flow
	@fail=0; for t in $^; do $(RUN) ./$$t || fail=1; done; \
	 if [ $$fail = 0 ]; then echo "ALL TESTS PASSED"; else echo "SOME TESTS FAILED"; exit 1; fi

$(BIN)/t_flow: t_flow.c $(CORE) $(GSRC) harness.h | $(BIN)
	$(CC) $(CFLAGS) -o $@ t_flow.c $(CORE) $(GSRC) -lm

# Each game's test #includes that game's source (to read its private state), so it links every OTHER game.
$(BIN)/t_%: t_%.c $(CORE) $(GSRC) harness.h | $(BIN)
	$(CC) $(CFLAGS) -o $@ t_$*.c $(CORE) $(filter-out ../source/g_$*.c,$(GSRC)) -lm

$(BIN):
	@mkdir -p $(BIN)

clean:
	rm -rf $(BIN)

# ---- screenshots and video ------------------------------------------------------------------------------
# `make captures` re-runs every test with a PC software renderer (gfx_soft.c) in place of the stub graphics, and
# records mp4 video and PNG screenshots of the game code being exercised. Needs ffmpeg (set FFMPEG=/path if it is
# not on PATH). These are renders of the real game logic and drawing calls, NOT output from a Wii or an emulator.
CAPDIR  ?= captures
FFMPEG  ?= ffmpeg
CAPSRC  := gfx_soft.c capture.c ../source/font_data.c
CAPFLAGS := -std=gnu11 -O2 -Wall -Wextra -Wno-unused-function -Wno-missing-field-initializers -DCAPTURE -rdynamic -I../source

.PHONY: captures
captures: $(addprefix $(BIN)/cap/t_,$(GAMES)) $(BIN)/cap/t_flow
	@rm -rf $(CAPDIR); mkdir -p $(CAPDIR)/videos $(CAPDIR)/shots
	@fail=0; for t in $(GAMES); do echo "recording t_$$t ..."; TEST_TIMEOUT=1800 CAPTURE_NAME=t_$$t CAPTURE_DIR=$(CAPDIR) FFMPEG=$(FFMPEG) ./$(BIN)/cap/t_$$t || fail=1; done; \
	 echo "recording t_flow ..."; TEST_TIMEOUT=1800 CAPTURE_NAME=t_flow CAPTURE_DIR=$(CAPDIR) CAPTURE_STEP=12 CAPTURE_MAX=2400 FFMPEG=$(FFMPEG) ./$(BIN)/cap/t_flow || fail=1; \
	 if [ $$fail = 0 ]; then echo "ALL RECORDED TESTS PASSED"; else echo "SOME RECORDED TESTS FAILED"; exit 1; fi

$(BIN)/cap/t_flow: t_flow.c $(CORE) $(CAPSRC) $(GSRC) harness.h | $(BIN)/cap
	$(CC) $(CAPFLAGS) -o $@ t_flow.c $(CORE) $(CAPSRC) $(GSRC) -lm

$(BIN)/cap/t_%: t_%.c $(CORE) $(CAPSRC) $(GSRC) harness.h | $(BIN)/cap
	$(CC) $(CAPFLAGS) -o $@ t_$*.c $(CORE) $(CAPSRC) $(filter-out ../source/g_$*.c,$(GSRC)) -lm

$(BIN)/cap:
	@mkdir -p $(BIN)/cap

# A guided tour (title, menu, every instruction screen, pause, results, disconnect) recorded on its own.
.PHONY: showcase
showcase: $(BIN)/cap/t_showcase
	@mkdir -p $(CAPDIR)/videos $(CAPDIR)/shots
	TEST_TIMEOUT=1800 CAPTURE_NAME=t_showcase CAPTURE_DIR=$(CAPDIR) FFMPEG=$(FFMPEG) ./$(BIN)/cap/t_showcase

$(BIN)/cap/t_showcase: t_showcase.c $(CORE) $(CAPSRC) $(GSRC) harness.h | $(BIN)/cap
	$(CC) $(CAPFLAGS) -o $@ t_showcase.c $(CORE) $(CAPSRC) $(GSRC) -lm
