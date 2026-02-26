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
