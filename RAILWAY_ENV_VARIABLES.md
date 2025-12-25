# Dashboard Service Environment Variables

## Required Variables for `ai-execution-dashboard-ultra`

### Set in Railway Dashboard:

```env
# API Connection (CRITICAL - Must be set before build)
NEXT_PUBLIC_API_BASE_URL=https://ai-execution-platform-production.up.railway.app

# Application Environment
NEXT_PUBLIC_APP_ENV=production
```

### How to Set:

1. Go to Railway Dashboard
2. Select `ai-execution-dashboard-ultra` service
3. Go to **Variables** tab
4. Click **+ New Variable**
5. Add both variables

### Via CLI:

```bash
cd D:\Github\ai-execution-dashboard-ultra
railway link --service ai-execution-dashboard-ultra
railway variables set NEXT_PUBLIC_API_BASE_URL=https://ai-execution-platform-production.up.railway.app
railway variables set NEXT_PUBLIC_APP_ENV=production
```

### Important:
- `NEXT_PUBLIC_API_BASE_URL` is a **build-time variable**
- Must be set BEFORE building
- If changed, service must be redeployed

