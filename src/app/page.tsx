'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ultraSecureApiClient } from '@/lib/api/client';

interface ApiHealth {
  status: string;
  cors: boolean;
  timestamp: string;
  data?: any;
}

interface ApiInfo {
  name?: string;
  version?: string;
  status?: string;
  endpoints?: any;
}

export default function HomePage() {
  const [dashboardStatus, setDashboardStatus] = useState<'online' | 'offline'>('online');
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null);
  const [apiInfo, setApiInfo] = useState<ApiInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Dashboard is always online if we're here
      setDashboardStatus('online');

      // Fetch API health
      try {
        const health = await ultraSecureApiClient.healthCheck();
        setApiHealth(health);
      } catch (err) {
        setApiHealth({
          status: 'error',
          cors: false,
          timestamp: new Date().toISOString(),
        });
      }

      // Fetch API info
      try {
        const info = await ultraSecureApiClient.getApiInfo();
        setApiInfo(info);
      } catch (err) {
        // API info fetch failed, but that's OK - we'll show what we have
        console.warn('Failed to fetch API info:', err);
      }

      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
      case 'healthy':
        return <Badge variant="success">Online</Badge>;
      case 'offline':
      case 'unhealthy':
        return <Badge variant="error">Offline</Badge>;
      case 'error':
        return <Badge variant="error">Error</Badge>;
      default:
        return <Badge variant="warning">Unknown</Badge>;
    }
  };

  const formatTimestamp = (timestamp: string | Date | null) => {
    if (!timestamp) return 'Never';
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">AI Execution Platform – Dashboard</h1>
          <p className="text-slate-400">System Status & Health Monitoring</p>
        </div>

        {/* Error Message */}
        {error && (
          <Card className="mb-6 border-red-500/50 bg-red-500/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Badge variant="error">Error</Badge>
                <span className="text-red-400">{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {/* Dashboard Status */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Dashboard Status</CardTitle>
                {getStatusBadge(dashboardStatus)}
              </div>
              <CardDescription className="text-slate-400">
                Frontend Application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-emerald-400 font-medium">Online</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Environment:</span>
                  <span className="text-slate-300">
                    {/* @ts-ignore - Next.js makes NEXT_PUBLIC_* available in browser */}
                    {process.env.NEXT_PUBLIC_APP_ENV || 'development'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* API Health Status */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">API Status</CardTitle>
                {apiHealth ? getStatusBadge(apiHealth.status) : (
                  <Badge variant="warning">Checking...</Badge>
                )}
              </div>
              <CardDescription className="text-slate-400">
                Backend Service Health
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading && !apiHealth ? (
                <div className="text-sm text-slate-400">Loading...</div>
              ) : apiHealth ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Status:</span>
                    <span className={
                      apiHealth.status === 'healthy' 
                        ? 'text-emerald-400 font-medium' 
                        : 'text-red-400 font-medium'
                    }>
                      {apiHealth.status === 'healthy' ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">CORS:</span>
                    <span className={apiHealth.cors ? 'text-emerald-400' : 'text-amber-400'}>
                      {apiHealth.cors ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  {apiHealth.data?.checks && (
                    <div className="mt-2 pt-2 border-t border-slate-700">
                      <div className="text-xs text-slate-400 space-y-1">
                        {Object.entries(apiHealth.data.checks).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span>{key}:</span>
                            <span className={value ? 'text-emerald-400' : 'text-red-400'}>
                              {value ? '✓' : '✗'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-red-400">Failed to fetch</div>
              )}
            </CardContent>
          </Card>

          {/* API Info */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">API Info</CardTitle>
                {apiInfo ? getStatusBadge(apiInfo.status || 'unknown') : (
                  <Badge variant="warning">Loading...</Badge>
                )}
              </div>
              <CardDescription className="text-slate-400">
                Service Information
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading && !apiInfo ? (
                <div className="text-sm text-slate-400">Loading...</div>
              ) : apiInfo ? (
                <div className="space-y-2">
                  {apiInfo.name && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Name:</span>
                      <span className="text-slate-300 font-medium">{apiInfo.name}</span>
                    </div>
                  )}
                  {apiInfo.version && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Version:</span>
                      <span className="text-slate-300">{apiInfo.version}</span>
                    </div>
                  )}
                  {apiInfo.status && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Status:</span>
                      <span className="text-emerald-400">{apiInfo.status}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-amber-400">API info unavailable</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* API Base URL Info */}
        <Card className="mb-6 bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">Configuration</CardTitle>
            <CardDescription className="text-slate-400">
              Current API endpoint configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">API Base URL:</span>
                <span className="text-slate-300 font-mono text-xs break-all">
                  {/* @ts-ignore - Next.js makes NEXT_PUBLIC_* available in browser */}
                  {process.env.NEXT_PUBLIC_API_BASE_URL || 'Not configured'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Last Checked:</span>
                <span className="text-slate-300">
                  {lastChecked ? formatTimestamp(lastChecked) : 'Never'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Refresh Button */}
        <div className="flex justify-center">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors duration-200 flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Checking...
              </>
            ) : (
              <>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Status
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
