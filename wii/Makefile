#---------------------------------------------------------------------------------
# Owen's Minigames: Wii build. Needs devkitPPC + libogc (see README.md, "Building"). Use ./build.sh for a checked build.
#   make            builds out/boot.dol
#   make package    builds, then assembles dist/apps/owen-minigames/ (boot.dol, meta.xml, icon.png)
#   make clean
#---------------------------------------------------------------------------------
.SUFFIXES:
ifeq ($(strip $(DEVKITPPC)),)
$(error "DEVKITPPC is not set. Run: source scripts/devkitpro-env.sh   (or install devkitPro and export DEVKITPPC=<path>/devkitPPC)")
endif

include $(DEVKITPPC)/wii_rules

TARGET   := boot
BUILD    := build
OUTDIR   := out
SOURCES  := source
INCLUDES := source
# Only libogc's own libraries are used: video (GX), sound (ASND) and the Wii Remote (wiiuse + bte). No libfat, no network.
LIBS     := -lwiiuse -lbte -lasnd -logc -lm

CFLAGS   = -g -O2 -Wall -Wextra $(MACHDEP) $(INCLUDE)
CXXFLAGS = $(CFLAGS)
LDFLAGS  = -g $(MACHDEP) -Wl,-Map,$(notdir $@).map

ifneq ($(BUILD),$(notdir $(CURDIR)))
export OUTPUT  := $(CURDIR)/$(OUTDIR)/$(TARGET)
export VPATH   := $(foreach dir,$(SOURCES),$(CURDIR)/$(dir))
export DEPSDIR := $(CURDIR)/$(BUILD)
CFILES   := $(foreach dir,$(SOURCES),$(notdir $(wildcard $(dir)/*.c)))
export LD      := $(CC)
export OFILES  := $(CFILES:.c=.o)
export INCLUDE := $(foreach dir,$(INCLUDES), -iquote $(CURDIR)/$(dir)) -I$(LIBOGC_INC)
export LIBPATHS := -L$(LIBOGC_LIB)

.PHONY: $(BUILD) clean package

$(BUILD):
	@[ -d $(BUILD) ] || mkdir -p $(BUILD)
	@[ -d $(OUTDIR) ] || mkdir -p $(OUTDIR)
	@$(MAKE) --no-print-directory -C $(BUILD) -f $(CURDIR)/Makefile

clean:
	@echo clean ...
	@rm -fr $(BUILD) $(OUTDIR) dist

package: $(BUILD)
	@test -s $(OUTDIR)/$(TARGET).dol || { echo "ERROR: $(OUTDIR)/$(TARGET).dol was not produced"; exit 1; }
	@rm -rf dist/apps/owen-minigames && mkdir -p dist/apps/owen-minigames
	@cp $(OUTDIR)/$(TARGET).dol dist/apps/owen-minigames/boot.dol
	@cp meta.xml icon.png dist/apps/owen-minigames/
	@echo "packaged: dist/apps/owen-minigames/"
else
DEPENDS := $(OFILES:.o=.d)
$(OUTPUT).dol: $(OUTPUT).elf
$(OUTPUT).elf: $(OFILES)
-include $(DEPENDS)
endif
