; Extra Start Menu shortcuts for the non-game utility apps, sitting next to
; the main "51 Mimi Games" shortcut in the same Start Menu folder. Each one
; launches the same exe with --app=<id>, which electron/main.js turns into a
; ?app=<id> query param that jumps straight into that tool (see js/app.js),
; skipping the search-home/landing/browse screens the main shortcut goes
; through. ${APP_EXECUTABLE_FILENAME} is defined by electron-builder's own
; NSIS template ("51 Mimi Games.exe" here) — same exe as the main shortcut.

!macro customInstall
  CreateShortCut "$SMPROGRAMS\Calculator (51 Mimi Games).lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--app=calculator"
  CreateShortCut "$SMPROGRAMS\Notes (51 Mimi Games).lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--app=notes"
  CreateShortCut "$SMPROGRAMS\Timer & Stopwatch (51 Mimi Games).lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--app=timer"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Calculator (51 Mimi Games).lnk"
  Delete "$SMPROGRAMS\Notes (51 Mimi Games).lnk"
  Delete "$SMPROGRAMS\Timer & Stopwatch (51 Mimi Games).lnk"
!macroend
