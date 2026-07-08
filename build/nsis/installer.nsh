; NSIS Installer Script for AI-GM Standalone
; Included by electron-builder NSIS target
; Provides custom installer pages and behavior

; Welcome page text
!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

; License page
!macro customLicensePage
  !insertmacro MUI_PAGE_LICENSE "$(^LicenseFile)"
!macroend

; Finish page with launch option
!macro customFinishPage
  !define MUI_FINISHPAGE_RUN "$INSTDIR\AI-GM Standalone.exe"
  !define MUI_FINISHPAGE_RUN_TEXT "Launch AI-GM Standalone"
  !define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.txt"
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Show README"
  !insertmacro MUI_PAGE_FINISH
!macroend

; Custom installation directory page (enabled by allowToChangeInstallationDirectory)
!macro customDirectoryPage
  !insertmacro MUI_PAGE_DIRECTORY
!macroend

; Pre-install: check if app is running
!macro customInstallCheck
  nsProcess::FindProcess "AI-GM Standalone.exe"
  Pop $R0
  StrCmp $R0 "1" 0 +3
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "AI-GM Standalone is running. Please close it before continuing." IDOK retry IDCANCEL cancel
    retry:
    nsProcess::FindProcess "AI-GM Standalone.exe"
    Pop $R0
    StrCmp $R0 "1" 0 +2
      Goto retry
    cancel:
    Abort
!macroend

; Post-install: create desktop shortcut if requested
!macro customInstall
  ; Desktop shortcut is handled by createDesktopShortcut in build config
!macroend
