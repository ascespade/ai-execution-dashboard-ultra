# Script to monitor Railway deployment
$serviceName = "ai-execution-dashboard-ultra"
$maxAttempts = 20
$waitSeconds = 30

Write-Host "🚀 Starting deployment monitoring..." -ForegroundColor Cyan
Write-Host "Service: $serviceName" -ForegroundColor Yellow
Write-Host "Checking every $waitSeconds seconds (max $maxAttempts attempts)" -ForegroundColor Yellow
Write-Host ""

# Wait initial 30 seconds
Write-Host "⏳ Waiting 30 seconds for deployment to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

$attempt = 0
$deploymentComplete = $false

while ($attempt -lt $maxAttempts -and -not $deploymentComplete) {
    $attempt++
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Gray
    Write-Host "Check #$attempt - $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Gray
    
    try {
        # Try to get deployment status
        $deployments = railway deployment list --limit 1 --json 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Deployment command executed successfully" -ForegroundColor Green
            
            # Try to get logs
            Write-Host "📋 Recent logs:" -ForegroundColor Yellow
            railway logs --tail 10 2>&1 | Select-Object -First 15
            
            Write-Host ""
            Write-Host "🔍 Checking deployment status..." -ForegroundColor Yellow
            railway deployment list --limit 3 2>&1
            
        } else {
            Write-Host "⚠️  Could not fetch deployment info. Service may not be linked." -ForegroundColor Yellow
            Write-Host "Trying to check via Railway web interface..." -ForegroundColor Yellow
        }
        
        # Check if we can connect to the service URL
        Write-Host ""
        Write-Host "🌐 Checking service URL..." -ForegroundColor Yellow
        $url = "https://ai-execution-dashboard-ultra-production.up.railway.app"
        try {
            $response = Invoke-WebRequest -Uri $url -Method Head -TimeoutSec 10 -ErrorAction Stop
            Write-Host "✅ Service is responding: HTTP $($response.StatusCode)" -ForegroundColor Green
            if ($response.StatusCode -eq 200) {
                $deploymentComplete = $true
                Write-Host "🎉 Deployment appears to be complete!" -ForegroundColor Green
            }
        } catch {
            Write-Host "⏳ Service not ready yet: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host "❌ Error checking deployment: $_" -ForegroundColor Red
    }
    
    if (-not $deploymentComplete -and $attempt -lt $maxAttempts) {
        Write-Host ""
        Write-Host "⏳ Waiting $waitSeconds seconds before next check..." -ForegroundColor Yellow
        Start-Sleep -Seconds $waitSeconds
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Gray
if ($deploymentComplete) {
    Write-Host "Deployment monitoring complete!" -ForegroundColor Green
    Write-Host "Dashboard URL: https://ai-execution-dashboard-ultra-production.up.railway.app" -ForegroundColor Cyan
} else {
    Write-Host "Monitoring stopped after $attempt attempts" -ForegroundColor Yellow
    Write-Host "Check Railway dashboard manually for deployment status" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Gray

