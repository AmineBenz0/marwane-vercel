# How to Start the Application

## Prerequisites
- PostgreSQL running in Docker (WSL)
- Node.js installed (for frontend)
- Python 3.10+ installed in WSL (for backend)

## Step 1: Start PostgreSQL Database

```powershell
# From Windows PowerShell
wsl docker compose up -d postgres
```

Wait 5-10 seconds for the database to be ready.

## Step 2: Start Backend Server (from WSL)

**Option A: Using WSL command from Windows:**
```powershell
# From Windows PowerShell
wsl bash -c "cd /mnt/c/Users/mbenzaarit/Desktop/marwane/backend && python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
```

**Option B: Open WSL terminal and run:**
```bash
# From WSL terminal
cd /mnt/c/Users/mbenzaarit/Desktop/marwane/backend
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be accessible at `http://localhost:8000`

## Step 3: Start Frontend (from Windows)

```powershell
# From Windows PowerShell
cd frontend
npm run dev
```

The frontend will be accessible at `http://localhost:3000`

## Login Credentials

- **Email:** `admin@example.com`
- **Password:** `Admin@123`
- **Role:** admin

## Troubleshooting

### Backend can't connect to database
- Make sure PostgreSQL is running: `wsl docker compose ps`
- Backend must run from WSL, not Windows
- Check database logs: `wsl docker compose logs postgres`

### Frontend can't connect to backend
- Check backend is accessible: `curl http://localhost:8000`
- Check CORS settings in `backend/app/config.py`
- Make sure port 8000 is not blocked

### Database port forwarding issues
- WSL2 should automatically forward ports
- If issues persist, try restarting Docker Desktop

