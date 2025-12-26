'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ultraSecureApiClient } from '@/lib/api/client';
import { AlertCircle, CheckCircle2, XCircle, Clock, Database, Plug, Activity, Server, Settings, AlertTriangle } from 'lucide-react';

// Status types
type SystemStatus = 'operational' | 'not_ready' | 'down';
type CheckStatus = 'success' | 'warning' | 'error' | 'loading';

interface EndpointCheck {
  name: string;
  path: string;
  status: CheckStatus;
  latency?: number;
  error?: string;
  lastChecked?: Date;
}

interface PluginStatus {
  name: string;
  available: boolean;
  error?: string;
}

interface SystemDiagnostics {
  globalStatus: SystemStatus;
  healthStatus: CheckStatus;
  readyStatus: CheckStatus;
  healthData?: any;
  readyData?: any;
  plugins: PluginStatus[];
  endpoints: EndpointCheck[];
  metricsAvailable: boolean;
  problems: string[];
  insights: string[];
}

export default function HomePage() {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics>({
    globalStatus: 'down',
    healthStatus: 'loading',
    readyStatus: 'loading',
    plugins: [],
    endpoints: [],
    metricsAvailable: false,
    problems: [],
    insights: [],
  });
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const checkEndpoint = async (name: string, path: string): Promise<EndpointCheck> => {
    const startTime = Date.now();
    try {
      const rootUrl = ultraSecureApiClient.getRootUrl();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${rootUrl}${path}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      return {
        name,
        path,
        status: response.ok ? 'success' : 'error',
        latency,
        lastChecked: new Date(),
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        name,
        path,
        status: 'error',
        latency,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  };

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    const problems: string[] = [];
    const insights: string[] = [];

    try {
      // 1. Check /health endpoint
      const healthResult = await ultraSecureApiClient.healthCheck();
      const healthStatus: CheckStatus = 
        healthResult.status === 'healthy' ? 'success' :
        healthResult.status === 'unhealthy' ? 'error' : 'error';

      if (healthStatus === 'error') {
        problems.push('Health endpoint is failing. The system may be down or unreachable.');
      }

      // 2. Check /ready endpoint
      const readyResult = await ultraSecureApiClient.readyCheck();
      const readyStatus: CheckStatus = 
        readyResult.status === 'ready' ? 'success' :
        readyResult.status === 'not_ready' ? 'warning' : 'error';

      if (readyStatus === 'error') {
        problems.push('Ready endpoint is unreachable. Cannot determine if system is ready.');
      } else if (readyStatus === 'warning') {
        problems.push('System is not ready. Dependencies may not be initialized.');
      }

      // 3. Determine global status
      let globalStatus: SystemStatus = 'down';
      if (healthStatus === 'error') {
        globalStatus = 'down';
        insights.push('System is DOWN: Health check failed. Core services are not responding.');
      } else if (readyStatus === 'error' || readyStatus === 'warning') {
        globalStatus = 'not_ready';
        insights.push('System is NOT READY: Health check passed but readiness check failed. System may be starting up or dependencies are unavailable.');
      } else {
        globalStatus = 'operational';
        insights.push('System is OPERATIONAL: Both health and readiness checks passed.');
      }

      // 4. Check plugins
      const pluginStatuses: PluginStatus[] = [];
      try {
        const pluginsResult = await ultraSecureApiClient.checkPlugins();
        if (pluginsResult.status === 'available' && pluginsResult.plugins) {
          const requiredPlugins = ['store', 'supervisor', 'memory'];
          const foundPlugins = pluginsResult.plugins.map((p: any) => 
            (p.name || p.id || '').toLowerCase()
          );

          requiredPlugins.forEach(pluginName => {
            const found = foundPlugins.some((name: string) => 
              name.includes(pluginName) || name === pluginName
            );
            pluginStatuses.push({
              name: pluginName.charAt(0).toUpperCase() + pluginName.slice(1),
              available: found,
              error: found ? undefined : `Plugin not found in available plugins list`,
            });
            if (!found) {
              problems.push(`${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)} plugin is not available.`);
            }
          });
        } else {
          // If we can't fetch plugins, check health data for plugin info
          if (healthResult.data?.checks) {
            Object.keys(healthResult.data.checks).forEach(key => {
              if (key.toLowerCase().includes('plugin')) {
                pluginStatuses.push({
                  name: key,
                  available: healthResult.data.checks[key] === true,
                  error: healthResult.data.checks[key] === false ? 'Plugin check failed' : undefined,
                });
              }
            });
          }
        }
      } catch (error) {
        problems.push('Unable to check plugin status. Plugin endpoint may be unavailable.');
      }

      // 5. Check additional endpoints
      const endpointsToCheck: { name: string; path: string }[] = [
        { name: 'Root', path: '/' },
        { name: 'Health', path: '/health' },
        { name: 'Ready', path: '/ready' },
      ];

      // Check metrics if available
      let metricsAvailable = false;
      try {
        const metricsResult = await ultraSecureApiClient.checkMetrics();
        metricsAvailable = metricsResult.status === 'available';
        if (metricsAvailable) {
          endpointsToCheck.push({ name: 'Metrics', path: '/metrics' });
        }
      } catch {
        // Metrics not available, that's OK
      }

      const endpointChecks = await Promise.all(
        endpointsToCheck.map(ep => checkEndpoint(ep.name, ep.path))
      );

      // 6. Analyze health data for runtime info
      if (healthResult.data?.checks) {
        const checks = healthResult.data.checks;
        if (checks.database === false) {
          problems.push('Database connection is failing. Persistence layer may be unavailable.');
        }
        if (checks.redis === false) {
          insights.push('Redis cache is unavailable. Performance may be degraded.');
        }
      }

      // 7. Analyze ready data for dependency info
      if (readyResult.data) {
        if (typeof readyResult.data === 'object') {
          Object.entries(readyResult.data).forEach(([key, value]) => {
            if (value === false && key.toLowerCase().includes('database')) {
              problems.push('Database dependency is not ready. Migrations may not be applied or connection is failing.');
            }
          });
        }
      }

      setDiagnostics({
        globalStatus,
        healthStatus,
        readyStatus,
        healthData: healthResult.data,
        readyData: readyResult.data,
        plugins: pluginStatuses,
        endpoints: endpointChecks,
        metricsAvailable,
        problems,
        insights,
      });

      setLastChecked(new Date());
    } catch (error) {
      setDiagnostics((prev: SystemDiagnostics) => ({
        ...prev,
        globalStatus: 'down',
        healthStatus: 'error',
        readyStatus: 'error',
        problems: ['Failed to fetch system diagnostics. Check network connectivity and API base URL configuration.'],
      }));
    } finally {
      setLoading(false);
    }
  }, [refreshKey]);

  useEffect(() => {
    fetchDiagnostics();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchDiagnostics]);

  const getSystemStatusBadge = (status: SystemStatus) => {
    switch (status) {
      case 'operational':
        return <Badge variant="success" className="text-base px-4 py-1.5">OPERATIONAL</Badge>;
      case 'not_ready':
        return <Badge variant="warning" className="text-base px-4 py-1.5">NOT READY</Badge>;
      case 'down':
        return <Badge variant="error" className="text-base px-4 py-1.5">DOWN</Badge>;
      default:
        return <Badge variant="warning" className="text-base px-4 py-1.5">UNKNOWN</Badge>;
    }
  };

  const getStatusIcon = (status: CheckStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-400" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-400" />;
      case 'loading':
        return <Clock className="h-5 w-5 text-slate-400 animate-spin" />;
    }
  };

  const getStatusColor = (status: CheckStatus) => {
    switch (status) {
      case 'success':
        return 'text-emerald-400';
      case 'warning':
        return 'text-amber-400';
      case 'error':
        return 'text-red-400';
      case 'loading':
        return 'text-slate-400';
    }
  };

  const getSystemStatusExplanation = (status: SystemStatus) => {
    switch (status) {
      case 'operational':
        return 'All core systems are healthy and ready to process requests.';
      case 'not_ready':
        return 'System is running but not ready. Dependencies may be initializing or unavailable.';
      case 'down':
        return 'System is down. Core services are not responding. Check server status and logs.';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">AI Execution Platform Dashboard</h1>
          <p className="text-slate-400">Real-time system health and runtime observability</p>
        </div>

        {/* Global System Status */}
        <Card className="mb-6 bg-slate-800/50 border-slate-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="h-6 w-6 text-slate-400" />
                <CardTitle className="text-2xl">Global System Status</CardTitle>
              </div>
              {loading ? (
                <Badge variant="warning">Checking...</Badge>
              ) : (
                getSystemStatusBadge(diagnostics.globalStatus)
              )}
            </div>
            <CardDescription className="text-slate-400 mt-2">
              {loading ? 'Evaluating system state...' : getSystemStatusExplanation(diagnostics.globalStatus)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 bg-slate-900/50 rounded-lg">
                {getStatusIcon(diagnostics.healthStatus)}
                <div>
                  <div className="font-medium">Health Check</div>
                  <div className={`text-sm ${getStatusColor(diagnostics.healthStatus)}`}>
                    {diagnostics.healthStatus === 'success' ? 'Healthy' :
                     diagnostics.healthStatus === 'error' ? 'Unhealthy' : 'Checking...'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-900/50 rounded-lg">
                {getStatusIcon(diagnostics.readyStatus)}
                <div>
                  <div className="font-medium">Readiness Check</div>
                  <div className={`text-sm ${getStatusColor(diagnostics.readyStatus)}`}>
                    {diagnostics.readyStatus === 'success' ? 'Ready' :
                     diagnostics.readyStatus === 'warning' ? 'Not Ready' :
                     diagnostics.readyStatus === 'error' ? 'Error' : 'Checking...'}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Core Runtime Health */}
        <Card className="mb-6 bg-slate-800/50 border-slate-700">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-slate-400" />
              <CardTitle className="text-xl">Core Runtime Health</CardTitle>
            </div>
            <CardDescription className="text-slate-400">
              Kernel, execution path, and runtime exception status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 bg-slate-900/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {diagnostics.healthStatus === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-400" />
                    )}
                    <span>Kernel Loaded</span>
                  </div>
                  <span className={diagnostics.healthStatus === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                    {diagnostics.healthStatus === 'success' ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {diagnostics.readyStatus === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-400" />
                    )}
                    <span>Execution Path Active</span>
                  </div>
                  <span className={diagnostics.readyStatus === 'success' ? 'text-emerald-400' : 'text-amber-400'}>
                    {diagnostics.readyStatus === 'success' ? 'Active' : 'Degraded'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {diagnostics.problems.length === 0 ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-400" />
                    )}
                    <span>Runtime Exceptions</span>
                  </div>
                  <span className={diagnostics.problems.length === 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {diagnostics.problems.length === 0 ? 'None' : `${diagnostics.problems.length} issues`}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plugin Diagnostics */}
        <Card className="mb-6 bg-slate-800/50 border-slate-700">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Plug className="h-5 w-5 text-slate-400" />
              <CardTitle className="text-xl">Plugin Diagnostics</CardTitle>
            </div>
            <CardDescription className="text-slate-400">
              Core plugin availability and status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 bg-slate-900/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : diagnostics.plugins.length > 0 ? (
              <div className="space-y-3">
                    {diagnostics.plugins.map((plugin: PluginStatus, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {plugin.available ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400" />
                      )}
                      <span>{plugin.name} Plugin</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {plugin.available ? (
                        <Badge variant="success">Available</Badge>
                      ) : (
                        <Badge variant="error">Missing</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-400 text-sm p-3 bg-slate-900/50 rounded-lg">
                Plugin information unavailable. Check API connectivity.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database & Persistence */}
        <Card className="mb-6 bg-slate-800/50 border-slate-700">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-slate-400" />
              <CardTitle className="text-xl">Database & Persistence</CardTitle>
            </div>
            <CardDescription className="text-slate-400">
              Database connectivity and persistence layer status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 bg-slate-900/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {diagnostics.readyStatus === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-400" />
                    )}
                    <span>Database Reachable</span>
                  </div>
                  <span className={diagnostics.readyStatus === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                    {diagnostics.readyStatus === 'success' ? 'Connected' : 'Unreachable'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {diagnostics.readyStatus === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-400" />
                    )}
                    <span>Migrations Applied</span>
                  </div>
                  <span className={diagnostics.readyStatus === 'success' ? 'text-emerald-400' : 'text-amber-400'}>
                    {diagnostics.readyStatus === 'success' ? 'Up to date' : 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {diagnostics.readyStatus === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-400" />
                    )}
                    <span>Persistence Layer</span>
                  </div>
                  <span className={diagnostics.readyStatus === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                    {diagnostics.readyStatus === 'success' ? 'Responding' : 'Not responding'}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Surface */}
        <Card className="mb-6 bg-slate-800/50 border-slate-700">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-slate-400" />
              <CardTitle className="text-xl">API Surface</CardTitle>
            </div>
            <CardDescription className="text-slate-400">
              Endpoint availability and response times
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-10 bg-slate-900/50 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left p-3 text-slate-400 font-medium">Endpoint</th>
                      <th className="text-left p-3 text-slate-400 font-medium">Path</th>
                      <th className="text-left p-3 text-slate-400 font-medium">Status</th>
                      <th className="text-left p-3 text-slate-400 font-medium">Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostics.endpoints.map((endpoint: EndpointCheck, idx: number) => (
                      <tr key={idx} className="border-b border-slate-800">
                        <td className="p-3">{endpoint.name}</td>
                        <td className="p-3 text-slate-400 font-mono text-sm">{endpoint.path}</td>
                        <td className="p-3">
                          {endpoint.status === 'success' ? (
                            <Badge variant="success">Online</Badge>
                          ) : (
                            <Badge variant="error">Offline</Badge>
                          )}
                        </td>
                        <td className="p-3 text-slate-300">
                          {endpoint.latency !== undefined ? `${endpoint.latency}ms` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Configuration Snapshot */}
        <Card className="mb-6 bg-slate-800/50 border-slate-700">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-slate-400" />
              <CardTitle className="text-xl">Configuration Snapshot</CardTitle>
            </div>
            <CardDescription className="text-slate-400">
              Runtime environment and detected features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between p-3 bg-slate-900/50 rounded-lg">
                <span className="text-slate-400">Environment</span>
                <span className="text-slate-300 font-mono text-sm">
                  {/* @ts-ignore */}
                  {process.env.NEXT_PUBLIC_APP_ENV || 'development'}
                </span>
              </div>
              <div className="flex justify-between p-3 bg-slate-900/50 rounded-lg">
                <span className="text-slate-400">API Base URL</span>
                <span className="text-slate-300 font-mono text-xs break-all text-right max-w-md">
                  {/* @ts-ignore */}
                  {process.env.NEXT_PUBLIC_API_BASE_URL || 'Not configured'}
                </span>
              </div>
              <div className="flex justify-between p-3 bg-slate-900/50 rounded-lg">
                <span className="text-slate-400">Metrics Endpoint</span>
                <span className={diagnostics.metricsAvailable ? 'text-emerald-400' : 'text-amber-400'}>
                  {diagnostics.metricsAvailable ? 'Available' : 'Not available'}
                </span>
              </div>
              <div className="flex justify-between p-3 bg-slate-900/50 rounded-lg">
                <span className="text-slate-400">Last Checked</span>
                <span className="text-slate-300">
                  {lastChecked ? lastChecked.toLocaleString() : 'Never'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Problems & Insights */}
        {(diagnostics.problems.length > 0 || diagnostics.insights.length > 0) && (
          <Card className="mb-6 bg-slate-800/50 border-slate-700">
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-slate-400" />
                <CardTitle className="text-xl">Problems & Insights</CardTitle>
              </div>
              <CardDescription className="text-slate-400">
                System issues and diagnostic information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {diagnostics.problems.length > 0 && (
                  <div>
                    <h4 className="text-red-400 font-medium mb-2 flex items-center gap-2">
                      <XCircle className="h-4 w-4" />
                      Problems ({diagnostics.problems.length})
                    </h4>
                    <ul className="space-y-2">
                      {diagnostics.problems.map((problem: string, idx: number) => (
                        <li key={idx} className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">
                          {problem}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {diagnostics.insights.length > 0 && (
                  <div>
                    <h4 className="text-amber-400 font-medium mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Insights
                    </h4>
                    <ul className="space-y-2">
                      {diagnostics.insights.map((insight: string, idx: number) => (
                        <li key={idx} className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-300">
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Refresh Button */}
        <div className="flex justify-center">
          <button
            onClick={() => {
              setRefreshKey((prev: number) => prev + 1);
            }}
            disabled={loading}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors duration-200 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Clock className="h-5 w-5 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <Activity className="h-5 w-5" />
                Refresh Status
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
