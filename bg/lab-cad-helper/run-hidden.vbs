' Abuts lab helper - run lab-cad-helper.ps1 without a window (install / protocol / startup).
' Keep this file ASCII-only: wscript reads .vbs in the ANSI code page.
' related: lab-cad-helper.ps1, install.ps1
Option Explicit
Dim sh, fso, dir, ps1, arg, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = dir & "\lab-cad-helper.ps1"
If Not fso.FileExists(ps1) Then
  MsgBox "lab-cad-helper.ps1 not found." & vbCrLf & dir, 16, "Abuts"
  WScript.Quit 1
End If

arg = ""
If WScript.Arguments.Count > 0 Then
  arg = Trim(WScript.Arguments(0))
End If

' Already running (port answers) -> exit quietly
If HelperAlive() Then
  WScript.Quit 0
End If

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
If Len(arg) > 0 Then
  cmd = cmd & " -ProtocolArg """ & Replace(arg, """", "") & """"
End If
' 0 = hidden, False = do not wait
sh.Run cmd, 0, False
WScript.Quit 0

Function HelperAlive()
  On Error Resume Next
  Dim http
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 500, 500, 800, 800
  http.Open "GET", "http://127.0.0.1:8010/health", False
  http.Send
  If Err.Number = 0 And http.Status = 200 Then
    HelperAlive = True
  Else
    HelperAlive = False
  End If
  On Error GoTo 0
End Function
