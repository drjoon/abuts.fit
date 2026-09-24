' Abuts CAD Helper — 창 없이 실행 (설치·프로토콜·시작프로그램용)
' related: lab-cad-helper.ps1, 여기를_더블클릭_설치.cmd
Option Explicit
Dim sh, fso, dir, ps1, arg, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = dir & "\lab-cad-helper.ps1"
If Not fso.FileExists(ps1) Then
  MsgBox "lab-cad-helper.ps1 을 찾을 수 없습니다." & vbCrLf & dir, 16, "Abuts CAD 연결"
  WScript.Quit 1
End If

arg = ""
If WScript.Arguments.Count > 0 Then
  arg = Trim(WScript.Arguments(0))
End If

' 이미 떠 있으면 조용히 종료 (포트 응답)
If HelperAlive() Then
  WScript.Quit 0
End If

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
If Len(arg) > 0 Then
  cmd = cmd & " -ProtocolArg """ & Replace(arg, """", "") & """"
End If
' 0 = 숨김, False = 기다리지 않음
sh.Run cmd, 0, False
WScript.Quit 0

Function HelperAlive()
  On Error Resume Next
  Dim http
  Set http = CreateObject("MSXML2.XMLHTTP")
  http.Open "GET", "http://127.0.0.1:8010/health", False
  http.setTimeouts 500, 500, 500, 800
  http.Send
  If Err.Number = 0 And http.Status = 200 Then
    HelperAlive = True
  Else
    HelperAlive = False
  End If
  On Error GoTo 0
End Function
