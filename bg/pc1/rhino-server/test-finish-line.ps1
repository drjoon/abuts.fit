# Finish line 등록 테스트 스크립트

$headers = @{
    'Content-Type' = 'application/json'
    'X-Bridge-Secret' = 'YOUR_SECRET'
}

$body = @{
    requestId = '20260311-UWKAQBCR'
    filePath = '20260311-UWKAQBCR-거제-이지운-16.stl'
    finishLine = @{
        points = @(
            @(0, 0, 5),
            @(1, 0, 5),
            @(0, 1, 5)
        )
    }
} | ConvertTo-Json -Depth 10

Write-Host "Sending finish line registration request..."
Write-Host "Body: $body"

try {
    $response = Invoke-WebRequest -Uri 'http://localhost:8080/api/bg/register-finish-line' `
        -Method POST `
        -Headers $headers `
        -Body $body `
        -ContentType 'application/json' `
        -ErrorAction Stop
    
    Write-Host "Success! Status: $($response.StatusCode)"
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host "Full error: $_"
}
