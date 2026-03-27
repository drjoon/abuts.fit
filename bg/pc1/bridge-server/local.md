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
