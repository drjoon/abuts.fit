# bridge-server env / IO memo

## Startup panel IO snapshot

- machine M4 / panelType=2
  - C_START=61
  - C_CONT=63
  - IO_R_GREEN=64
  - IO_R_YELLOW=65
  - IO_R_RED=66
- machine M5 / panelType=2
  - C_START=61
  - C_CONT=63
  - IO_R_GREEN=64
  - IO_R_YELLOW=65
  - IO_R_RED=66

## Notes

- `C_START` is confirmed as `61` from the sample + runtime snapshot.
- `busy` is still the important one to confirm, but `65 (IO_R_YELLOW)` is the current best candidate from the startup dump.
- `CNC_START_IOUID` / `CNC_BUSY_IOUID` are now fixed in code (`61` / `65`) and were removed from `local.env`.
- `TryStartSignal()` now uses the machine's real `panelType` from `GetMachineInfo` instead of hardcoded `0`.
- When `CncMachineSignalUtils.TryGetMachineBusy()` finds IO `65`, it now logs the matched IO name/status so real-mode tests can confirm whether `IO_R_YELLOW` becomes `1` during machining.
- `ProcessMachine()` now returns immediately after the running branch so an already-running job cannot fall through into the idle start path and start the same job twice.
- `TryStartSignal()` clears `F_SB` (single block) before sending `C_START`; M5 was starting with `F_SB=1`, which likely caused coolant-only behavior without continuous cutting.
- Real-mode completion now requires `currentProdCount > ProductCountBefore` after `busy` falls to `0`; all time-based completion fallbacks were removed to avoid premature job switching.
- `CheckJobCompleted()` now logs the start baseline count and the completion count delta so we can confirm whether the product counter really increments by `+1`.
