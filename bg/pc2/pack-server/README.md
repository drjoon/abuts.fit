# abuts pack-server

Custom abutment packing label print server (single product label).

## Features

- `GET /health`
- `GET /printers` (CUPS printer list)
- `POST /print-zpl` (print raw ZPL)
- `POST /print-packing-label` (generate and print standard packing label ZPL)

## Run

```bash
cp local.env.example local.env
node app.js
```

Default port: `5788`

## Windows Service (NSSM)

1. Install [NSSM](https://nssm.cc/download) (e.g., `C:\tools\nssm\nssm.exe`).
2. Install Node.js (default `C:\Program Files\nodejs\node.exe`).
3. Configure `local.env`.
4. Run PowerShell (관리자) in this folder:
   ```powershell
   ./install-windows-service.ps1 -Action install
   ```

   - Other actions: `-Action remove|restart|status`
   - Override service name/path if needed using `-ServiceName`, `-NssmPath`, `-NodePath`.
5. Logs: `./logs/stdout.log`, `./logs/stderr.log` (auto-rotated).

## Security

If `PACK_PRINT_SERVER_SHARED_SECRET` is set, every API call except `/health` must include:

- Header: `x-pack-secret: <secret>`

## POST /print-zpl

```json
{
  "printer": "ZM400",
  "title": "Packing Label",
  "copies": 1,
  "zpl": "^XA...^XZ"
}
```

## POST /print-packing-label

```json
{
  "printer": "ZM400",
  "copies": 1,
  "requestId": "REQ-20260226-0001",
  "lotNumber": "ACZ",
  "patientName": "Hong Gil Dong",
  "toothNumber": "26",
  "material": "Ti",
  "caseType": "Custom Abutment",
  "printedAt": "2026-02-26 21:40"
}
```

The endpoint creates ZPL internally and sends it to printer using `lp -o raw`.
