# Simple deployment monitor
$url = "https://ai-execution-dashboard-ultra-production.up.railway.app"
$maxChecks = 10
$waitTime = 30

Write-Host "Starting deployment monitoring..."
Write-Host "URL: $url"
Write-Host "Will check every $waitTime seconds, max $maxChecks checks"
Write-Host ""

# Initial wait
Write-Host "Waiting $waitTime seconds for deployment to start..."
Start-Sleep -Seconds $waitTime

for ($i = 1; $i -le $maxChecks; $i++) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "Check #$i - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Host "========================================"
    
    try {
        $response = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        Write-Host "SUCCESS: Service is UP!" -ForegroundColor Green
        Write-Host "HTTP Status: $($response.StatusCode)"
        Write-Host "Content Length: $($response.Content.Length) bytes"
        Write-Host ""
        Write-Host "Deployment appears to be complete!"
        Write-Host "Dashboard URL: $url"
        break
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode) {
            Write-Host "Service responding but with status: $statusCode" -ForegroundColor Yellow
            if ($statusCode -eq 200) {
                Write-Host "Deployment complete!"
                break
            }
        } else {
            Write-Host "Service not ready yet: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    
    if ($i -lt $maxChecks) {
        Write-Host ""
        Write-Host "Waiting $waitTime seconds before next check..."
        Start-Sleep -Seconds $waitTime
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "Monitoring complete"
Write-Host "========================================"

