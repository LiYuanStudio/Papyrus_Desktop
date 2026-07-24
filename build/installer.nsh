; NSIS Installer Script for Papyrus
; Placeholder for future custom installation steps

!macro customInit
  ; Runs at installer initialization
!macroend

!macro customInstall
  ; Override DisplayName to ensure it never includes version number
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_REGISTRY_KEY}" "DisplayName" "Papyrus Desktop"
!macroend

!macro customUninstall
  ; Ask user if they want to delete user data
  MessageBox MB_YESNO|MB_ICONQUESTION "是否要删除所有用户数据（笔记、卡片、配置等）？$\r$\n注意：此操作不可恢复！" /SD IDNO IDYES deleteUserData IDNO skipUserDataDelete
  
  deleteUserData:
    ; Delete user data from APPDATA and PROFILE directories
    RMDir /r "$APPDATA\Papyrus"
    RMDir /r "$PROFILE\PapyrusData"
    Delete "$APPDATA\papyrus.db"
    Goto endUninstall
  
  skipUserDataDelete:
    Goto endUninstall
  
  endUninstall:
!macroend
