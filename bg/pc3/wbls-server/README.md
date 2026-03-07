# abuts wbls-server

Waybill (송장) label print server for shipping boxes (multiple products).

## Features

- `GET /health`
- `GET /printers`
- `POST /print` (download label PDF via URL or base64 → print via CUPS `lp`)

## Run

```bash
cp local.env.example local.env
node app.js
```

- Default port: `5777`
- Uses system CUPS queue (e.g. Zebra/Hanjin compatible printer)

## Windows Service (NSSM)

1. Install [NSSM](https://nssm.cc/download) (e.g., `C:\tools\nssm\nssm.exe`).
2. Install Node.js (default `C:\Program Files\nodejs\node.exe`).
3. Prepare `local.env` with printer info.
4. From an elevated PowerShell in this folder:
   ```powershell
   ./install-windows-service.ps1 -Action install
   ```

   - Other actions: `-Action remove|restart|status`
   - Customize service/node paths via `-ServiceName`, `-NssmPath`, `-NodePath`.
5. Logs rotate under `./logs/stdout.log`, `./logs/stderr.log`.

## Environment variables

| key                       | description                                    |
| ------------------------- | ---------------------------------------------- |
| `PRINT_SERVER_PORT`       | HTTP listen port (default `5777`)              |
| `PRINT_SERVER_ORIGIN`     | CORS allow-origin (default `*`)                |
| `WBL_PRINTER_DEFAULT`     | Optional default printer name for `/print`     |
| `WBL_PRINT_SHARED_SECRET` | Optional shared secret header (`x-wbl-secret`) |
| `WBL_DOWNLOAD_TIMEOUT_MS` | HTTP(S) download timeout for label file        |

## POST /print

```json
{
  "url": "https://example.com/label.pdf",
  "printer": "ZebraZM400",
  "title": "Hanjin Waybill"
}
```

- Either `url` or `base64` must be provided.
- When `base64` is provided, it must be a PDF encoded string.
- Prints using `lp` (CUPS). Temporary files are cleaned up after printing.
