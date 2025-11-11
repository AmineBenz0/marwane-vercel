# Script to start all services

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting Comptabilite Application" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop any running processes
Write-Host "[1/4] Stopping existing processes..." -ForegroundColor Yellow
Get-Process python*,uvicorn* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
wsl bash -c "pkill -f uvicorn" 2>$null
Write-Host "   ✓ Existing processes stopped" -ForegroundColor Green
Write-Host ""

# Step 2: Start PostgreSQL and Backend via Docker Compose
Write-Host "[2/4] Starting PostgreSQL and Backend (Docker)..." -ForegroundColor Yellow
wsl docker compose up -d
Write-Host "   Waiting for services to be ready..." -ForegroundColor Gray
Start-Sleep -Seconds 10
Write-Host "   ✓ Docker services started" -ForegroundColor Green
Write-Host ""

# Step 3: Check backend status
Write-Host "[3/4] Checking backend status..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/" -TimeoutSec 5
    Write-Host "   ✓ Backend is running!" -ForegroundColor Green
    Write-Host "      Status: $($response.status)" -ForegroundColor Gray
    Write-Host "      Version: $($response.version)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Backend not responding yet" -ForegroundColor Red
    Write-Host "   Waiting additional 10 seconds..." -ForegroundColor Gray
    Start-Sleep -Seconds 10
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8000/" -TimeoutSec 5
        Write-Host "   ✓ Backend is running!" -ForegroundColor Green
    } catch {
        Write-Host "   ✗ Backend still not responding. Check logs with:" -ForegroundColor Red
        Write-Host "      wsl docker compose logs backend" -ForegroundColor Gray
    }
}
Write-Host ""

# Step 4: Display service status
Write-Host "[4/4] Service Status:" -ForegroundColor Yellow
wsl docker compose ps
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Application URLs:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Backend API:  http://localhost:8000" -ForegroundColor White
Write-Host "  Frontend:     http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Login Credentials:" -ForegroundColor Cyan
Write-Host "  Email:    admin@example.com" -ForegroundColor White
Write-Host "  Password: Admin@123" -ForegroundColor White
Write-Host ""
Write-Host "To start the frontend:" -ForegroundColor Yellow
Write-Host "  cd frontend" -ForegroundColor Gray
Write-Host "  npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "To view logs:" -ForegroundColor Yellow
Write-Host "  wsl docker compose logs -f backend" -ForegroundColor Gray
Write-Host ""

