@echo off
setlocal
set ENV_FILE=%~dp0local.env

if not exist "%ENV_FILE%" (
    echo [run.cmd] local.env 파일을 찾을 수 없습니다: %ENV_FILE%
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$envFile = '%ENV_FILE%';" ^
  "$lines = Get-Content -Path $envFile | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and ($_ -notmatch '^\s*#') };" ^
  "foreach ($line in $lines) {" ^
  "  if ($line -match '^(?<key>[^=]+)=(?<value>.*)$') {" ^
  "    $name = $Matches['key'].Trim();" ^
  "    $value = $Matches['value'].Trim();" ^
  "    [Environment]::SetEnvironmentVariable($name, $value, 'User');" ^
  "    [Environment]::SetEnvironmentVariable($name, $value, 'Process');" ^
  "    Write-Host \"[Esprit.cmd] set $name=$value\";" ^
  "  }" ^
  "}"

echo [Esprit.cmd] 환경 변수가 갱신되었습니다. ESPRIT을 실행합니다.

set "ESPRIT_EXE=C:\Program Files (x86)\D.P.Technology\ESPRIT\Prog\esprit.exe"

if not exist "%ESPRIT_EXE%" goto MissingEsprit

echo [Esprit.cmd] ESPRIT 실행: %ESPRIT_EXE%
start "ESPRIT" "%ESPRIT_EXE%"
goto :eof

:MissingEsprit
echo [Esprit.cmd] 경고: ESPRIT 실행 파일을 찾을 수 없습니다: %ESPRIT_EXE%
exit /b 1

:eof
endlocal
