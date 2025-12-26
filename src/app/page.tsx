'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ultraSecureApiClient } from '@/lib/api/client';
import { AlertCircle, CheckCircle2, XCircle, Clock, Database, Plug, Activity, Server, Settings, AlertTriangle, Sparkles, TrendingUp } from 'lucide-react';

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
        return (
          <Badge variant="success" className="text-base px-5 py-2 font-semibold shadow-lg shadow-emerald-500/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 status-pulse"></div>
              OPERATIONAL
            </div>
          </Badge>
        );
      case 'not_ready':
        return (
          <Badge variant="warning" className="text-base px-5 py-2 font-semibold shadow-lg shadow-amber-500/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
              NOT READY
            </div>
          </Badge>
        );
      case 'down':
        return (
          <Badge variant="error" className="text-base px-5 py-2 font-semibold shadow-lg shadow-red-500/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div>
              DOWN
            </div>
          </Badge>
        );
      default:
        return <Badge variant="warning" className="text-base px-4 py-1.5">UNKNOWN</Badge>;
    }
  };

  const getStatusIcon = (status: CheckStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-6 w-6 text-emerald-400" />;
      case 'warning':
        return <AlertTriangle className="h-6 w-6 text-amber-400" />;
      case 'error':
        return <XCircle className="h-6 w-6 text-red-400" />;
      case 'loading':
        return <Clock className="h-6 w-6 text-slate-400 animate-spin" />;
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl relative z-10">
        {/* Header */}
        <div className="mb-10 fade-in">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl backdrop-blur-sm border border-blue-500/30">
              <Sparkles className="h-7 w-7 text-blue-400" />
            </div>
            <div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent">
                AI Execution Platform
              </h1>
              <p className="text-slate-400 text-lg mt-1">Real-time System Health Dashboard</p>
            </div>
          </div>
        </div>

        {/* Global System Status - Hero Card */}
        <Card className="mb-8 glass-effect border-slate-700/50 shadow-2xl fade-in">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-xl border border-emerald-500/30">
                  <Activity className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-3xl font-bold">Global System Status</CardTitle>
                  <CardDescription className="text-slate-300 mt-1 text-base">
                    {loading ? 'Evaluating system state...' : getSystemStatusExplanation(diagnostics.globalStatus)}
                  </CardDescription>
                </div>
              </div>
              {loading ? (
                <Badge variant="warning" className="text-base px-5 py-2">Checking...</Badge>
              ) : (
                getSystemStatusBadge(diagnostics.globalStatus)
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="group flex items-center gap-4 p-5 bg-gradient-to-br from-slate-900/80 to-slate-800/80 rounded-xl border border-slate-700/50 hover:border-emerald-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10">
                {getStatusIcon(diagnostics.healthStatus)}
                <div className="flex-1">
                  <div className="font-semibold text-lg mb-1">Health Check</div>
                  <div className={`text-sm font-medium ${getStatusColor(diagnostics.healthStatus)}`}>
                    {diagnostics.healthStatus === 'success' ? 'All systems healthy' :
                     diagnostics.healthStatus === 'error' ? 'System unhealthy' : 'Checking status...'}
                  </div>
                </div>
              </div>
              <div className="group flex items-center gap-4 p-5 bg-gradient-to-br from-slate-900/80 to-slate-800/80 rounded-xl border border-slate-700/50 hover:border-amber-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10">
                {getStatusIcon(diagnostics.readyStatus)}
                <div className="flex-1">
                  <div className="font-semibold text-lg mb-1">Readiness Check</div>
                  <div className={`text-sm font-medium ${getStatusColor(diagnostics.readyStatus)}`}>
                    {diagnostics.readyStatus === 'success' ? 'Ready for requests' :
                     diagnostics.readyStatus === 'warning' ? 'Not ready yet' :
                     diagnostics.readyStatus === 'error' ? 'Readiness check failed' : 'Checking status...'}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Core Runtime Health */}
          <Card className="glass-effect border-slate-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 fade-in">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg border border-blue-500/30">
                  <Server className="h-5 w-5 text-blue-400" />
                </div>
                <CardTitle className="text-xl font-bold">Core Runtime Health</CardTitle>
              </div>
              <CardDescription className="text-slate-300">
                Kernel, execution path, and runtime status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-14 bg-slate-900/50 rounded-lg animate-pulse shimmer" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50 hover:border-emerald-500/30 transition-all">
                    <div className="flex items-center gap-3">
                      {diagnostics.healthStatus === 'success' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400" />
                      )}
                      <span className="font-medium">Kernel Loaded</span>
                    </div>
                    <Badge variant={diagnostics.healthStatus === 'success' ? 'success' : 'error'}>
                      {diagnostics.healthStatus === 'success' ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50 hover:border-amber-500/30 transition-all">
                    <div className="flex items-center gap-3">
                      {diagnostics.readyStatus === 'success' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-amber-400" />
                      )}
                      <span className="font-medium">Execution Path</span>
                    </div>
                    <Badge variant={diagnostics.readyStatus === 'success' ? 'success' : 'warning'}>
                      {diagnostics.readyStatus === 'success' ? 'Active' : 'Degraded'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50 hover:border-red-500/30 transition-all">
                    <div className="flex items-center gap-3">
                      {diagnostics.problems.length === 0 ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400" />
                      )}
                      <span className="font-medium">Runtime Exceptions</span>
                    </div>
                    <Badge variant={diagnostics.problems.length === 0 ? 'success' : 'error'}>
                      {diagnostics.problems.length === 0 ? 'None' : `${diagnostics.problems.length} issues`}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Plugin Diagnostics */}
          <Card className="glass-effect border-slate-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 fade-in">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg border border-purple-500/30">
                  <Plug className="h-5 w-5 text-purple-400" />
                </div>
                <CardTitle className="text-xl font-bold">Plugin Diagnostics</CardTitle>
              </div>
              <CardDescription className="text-slate-300">
                Core plugin availability and status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-14 bg-slate-900/50 rounded-lg animate-pulse shimmer" />
                  ))}
                </div>
              ) : diagnostics.plugins.length > 0 ? (
                <div className="space-y-3">
                  {diagnostics.plugins.map((plugin: PluginStatus, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50 hover:border-purple-500/30 transition-all">
                      <div className="flex items-center gap-3">
                        {plugin.available ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-400" />
                        )}
                        <span className="font-medium">{plugin.name} Plugin</span>
                      </div>
                      <Badge variant={plugin.available ? 'success' : 'error'}>
                        {plugin.available ? 'Available' : 'Missing'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-slate-400 text-sm p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                  Plugin information unavailable. Check API connectivity.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Database & Persistence */}
          <Card className="glass-effect border-slate-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 fade-in">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-lg border border-cyan-500/30">
                  <Database className="h-5 w-5 text-cyan-400" />
                </div>
                <CardTitle className="text-xl font-bold">Database & Persistence</CardTitle>
              </div>
              <CardDescription className="text-slate-300">
                Database connectivity and persistence layer
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-14 bg-slate-900/50 rounded-lg animate-pulse shimmer" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50 hover:border-cyan-500/30 transition-all">
                    <div className="flex items-center gap-3">
                      {diagnostics.readyStatus === 'success' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400" />
                      )}
                      <span className="font-medium">Database Reachable</span>
                    </div>
                    <Badge variant={diagnostics.readyStatus === 'success' ? 'success' : 'error'}>
                      {diagnostics.readyStatus === 'success' ? 'Connected' : 'Unreachable'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50 hover:border-cyan-500/30 transition-all">
                    <div className="flex items-center gap-3">
                      {diagnostics.readyStatus === 'success' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-amber-400" />
                      )}
                      <span className="font-medium">Migrations Applied</span>
                    </div>
                    <Badge variant={diagnostics.readyStatus === 'success' ? 'success' : 'warning'}>
                      {diagnostics.readyStatus === 'success' ? 'Up to date' : 'Unknown'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50 hover:border-cyan-500/30 transition-all">
                    <div className="flex items-center gap-3">
                      {diagnostics.readyStatus === 'success' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400" />
                      )}
                      <span className="font-medium">Persistence Layer</span>
                    </div>
                    <Badge variant={diagnostics.readyStatus === 'success' ? 'success' : 'error'}>
                      {diagnostics.readyStatus === 'success' ? 'Responding' : 'Not responding'}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* API Surface */}
          <Card className="glass-effect border-slate-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 fade-in">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-lg border border-emerald-500/30">
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                </div>
                <CardTitle className="text-xl font-bold">API Surface</CardTitle>
              </div>
              <CardDescription className="text-slate-300">
                Endpoint availability and response times
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-12 bg-slate-900/50 rounded animate-pulse shimmer" />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-700/50">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-900/80 to-slate-800/80 border-b border-slate-700/50">
                        <th className="text-left p-4 text-slate-300 font-semibold">Endpoint</th>
                        <th className="text-left p-4 text-slate-300 font-semibold">Path</th>
                        <th className="text-left p-4 text-slate-300 font-semibold">Status</th>
                        <th className="text-left p-4 text-slate-300 font-semibold">Latency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diagnostics.endpoints.map((endpoint: EndpointCheck, idx: number) => (
                        <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-900/30 transition-colors">
                          <td className="p-4 font-medium">{endpoint.name}</td>
                          <td className="p-4 text-slate-400 font-mono text-sm">{endpoint.path}</td>
                          <td className="p-4">
                            {endpoint.status === 'success' ? (
                              <Badge variant="success">Online</Badge>
                            ) : (
                              <Badge variant="error">Offline</Badge>
                            )}
                          </td>
                          <td className="p-4 text-slate-300 font-medium">
                            {endpoint.latency !== undefined ? (
                              <span className={endpoint.latency < 200 ? 'text-emerald-400' : endpoint.latency < 500 ? 'text-amber-400' : 'text-red-400'}>
                                {endpoint.latency}ms
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Configuration Snapshot */}
        <Card className="mb-6 glass-effect border-slate-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 fade-in">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-lg border border-amber-500/30">
                <Settings className="h-5 w-5 text-amber-400" />
              </div>
              <CardTitle className="text-xl font-bold">Configuration Snapshot</CardTitle>
            </div>
            <CardDescription className="text-slate-300">
              Runtime environment and detected features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex justify-between items-center p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50">
                <span className="text-slate-300 font-medium">Environment</span>
                <span className="text-white font-mono text-sm font-semibold px-3 py-1 bg-blue-500/20 rounded border border-blue-500/30">
                  {/* @ts-ignore */}
                  {process.env.NEXT_PUBLIC_APP_ENV || 'development'}
                </span>
              </div>
              <div className="flex justify-between items-center p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50">
                <span className="text-slate-300 font-medium">Metrics Endpoint</span>
                <Badge variant={diagnostics.metricsAvailable ? 'success' : 'warning'}>
                  {diagnostics.metricsAvailable ? 'Available' : 'Not available'}
                </Badge>
              </div>
              <div className="md:col-span-2 flex justify-between items-center p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50">
                <span className="text-slate-300 font-medium">API Base URL</span>
                <span className="text-slate-200 font-mono text-xs break-all text-right max-w-md px-3 py-1 bg-slate-800/50 rounded border border-slate-700/50">
                  {/* @ts-ignore */}
                  {process.env.NEXT_PUBLIC_API_BASE_URL || 'Not configured'}
                </span>
              </div>
              <div className="md:col-span-2 flex justify-between items-center p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50">
                <span className="text-slate-300 font-medium">Last Checked</span>
                <span className="text-slate-200 font-medium">
                  {lastChecked ? lastChecked.toLocaleString() : 'Never'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Problems & Insights */}
        {(diagnostics.problems.length > 0 || diagnostics.insights.length > 0) && (
          <Card className="mb-6 glass-effect border-slate-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 fade-in">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-lg border border-red-500/30">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                </div>
                <CardTitle className="text-xl font-bold">Problems & Insights</CardTitle>
              </div>
              <CardDescription className="text-slate-300">
                System issues and diagnostic information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {diagnostics.problems.length > 0 && (
                  <div>
                    <h4 className="text-red-400 font-semibold mb-3 flex items-center gap-2 text-lg">
                      <XCircle className="h-5 w-5" />
                      Problems ({diagnostics.problems.length})
                    </h4>
                    <ul className="space-y-2">
                      {diagnostics.problems.map((problem: string, idx: number) => (
                        <li key={idx} className="p-4 bg-gradient-to-r from-red-500/10 to-red-500/5 border border-red-500/30 rounded-lg text-sm text-red-200 hover:border-red-500/50 transition-all">
                          {problem}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {diagnostics.insights.length > 0 && (
                  <div>
                    <h4 className="text-amber-400 font-semibold mb-3 flex items-center gap-2 text-lg">
                      <AlertTriangle className="h-5 w-5" />
                      Insights
                    </h4>
                    <ul className="space-y-2">
                      {diagnostics.insights.map((insight: string, idx: number) => (
                        <li key={idx} className="p-4 bg-gradient-to-r from-amber-500/10 to-amber-500/5 border border-amber-500/30 rounded-lg text-sm text-amber-200 hover:border-amber-500/50 transition-all">
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
        <div className="flex justify-center mb-8">
          <button
            onClick={() => {
              setRefreshKey((prev: number) => prev + 1);
            }}
            disabled={loading}
            className="group px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-300 flex items-center gap-3 shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-105 disabled:hover:scale-100"
          >
            {loading ? (
              <>
                <Clock className="h-5 w-5 animate-spin" />
                Checking Status...
              </>
            ) : (
              <>
                <Activity className="h-5 w-5 group-hover:rotate-180 transition-transform duration-500" />
                Refresh Status
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
