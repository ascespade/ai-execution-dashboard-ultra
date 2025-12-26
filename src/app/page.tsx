'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

// Force dynamic rendering - this page uses client-side hooks and cannot be statically generated
export const dynamic = 'force-dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ultraSecureApiClient, useOverview, useAgents, useOrchestrations, usePlugins } from '@/lib/api/client';
import { 
  AlertCircle, CheckCircle2, XCircle, Clock, Database, Plug, Activity, Server, Settings, 
  AlertTriangle, Sparkles, TrendingUp, Zap, Shield, Brain, Cpu, HardDrive, Network, 
  BarChart3, DollarSign, Users, ListChecks, Lightbulb, Wrench, RefreshCw, 
  ArrowUpRight, ArrowDownRight, Minus, Info
} from 'lucide-react';

// Types
type SystemStatus = 'operational' | 'degraded' | 'critical' | 'down';
type CheckStatus = 'success' | 'warning' | 'error' | 'loading';
type Severity = 'critical' | 'warning' | 'info' | 'success';

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
  status?: 'healthy' | 'degraded' | 'critical' | 'loading';
  error?: string;
  details?: any;
}

interface Problem {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  component: string;
  detectedAt: Date;
  solution: string;
  steps: string[];
  related?: string[];
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
  problems: Problem[];
  insights: string[];
  uptime?: number;
  version?: string;
}

interface StatCard {
  title: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
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
  const [autoRefresh, setAutoRefresh] = useState(true);

  // React Query hooks
  const { data: overview, isLoading: overviewLoading } = useOverview();
  const { data: agentsData, isLoading: agentsLoading } = useAgents({ limit: 10 });
  const { data: orchestrationsData, isLoading: orchestrationsLoading } = useOrchestrations({ limit: 10 });
  const { data: pluginsData, isLoading: pluginsLoading } = usePlugins();

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

  const detectProblems = (healthData: any, readyData: any, plugins: PluginStatus[], endpoints: EndpointCheck[]): Problem[] => {
    const problems: Problem[] = [];

    // Health check failures
    if (!healthData || healthData.status !== 'healthy') {
      problems.push({
        id: 'health-failure',
        severity: 'critical',
        title: 'Health Check Failed',
        description: 'The system health endpoint is not responding correctly. This indicates core system issues.',
        component: 'Core System',
        detectedAt: new Date(),
        solution: 'Restart the API service and check system logs for errors.',
        steps: [
          'Check Railway logs for the API service',
          'Verify database connectivity',
          'Check Redis connection status',
          'Restart the API service if needed',
          'Monitor health endpoint for recovery'
        ],
      });
    }

    // Readiness check failures
    if (!readyData || readyData.ready !== true) {
      problems.push({
        id: 'readiness-failure',
        severity: readyData?.ready === false ? 'warning' : 'critical',
        title: 'System Not Ready',
        description: 'The system readiness check indicates dependencies are not fully initialized.',
        component: 'System Initialization',
        detectedAt: new Date(),
        solution: 'Wait for dependencies to initialize or check dependency health.',
        steps: [
          'Check database migration status',
          'Verify all required plugins are loaded',
          'Check external service connectivity',
          'Review initialization logs',
          'Wait for automatic recovery (usually 1-2 minutes)'
        ],
      });
    }

    // Database connectivity issues
    if (healthData?.checks?.database === false) {
      problems.push({
        id: 'database-connection',
        severity: 'critical',
        title: 'Database Connection Failed',
        description: 'The system cannot connect to the PostgreSQL database.',
        component: 'Database',
        detectedAt: new Date(),
        solution: 'Check database service status and connection string.',
        steps: [
          'Verify PostgreSQL service is running in Railway',
          'Check DATABASE_URL environment variable',
          'Verify database credentials are correct',
          'Check network connectivity between services',
          'Review database service logs'
        ],
        related: ['readiness-failure'],
      });
    }

    // Redis connectivity issues
    if (healthData?.checks?.redis === false) {
      problems.push({
        id: 'redis-connection',
        severity: 'warning',
        title: 'Redis Cache Unavailable',
        description: 'The system cannot connect to Redis cache. Performance may be degraded.',
        component: 'Cache',
        detectedAt: new Date(),
        solution: 'Check Redis service status. System will work without cache but with reduced performance.',
        steps: [
          'Verify Redis service is running in Railway',
          'Check REDIS_URL environment variable',
          'Verify Redis credentials',
          'System will continue operating without cache',
          'Check Redis service logs for details'
        ],
      });
    }

    // Missing critical plugins
    // Check for plugins with flexible matching (store-postgres, supervisor-postgres, memory-stm-db, etc.)
    const criticalPlugins = [
      { name: 'store', patterns: ['store', 'store-postgres', 'database-postgres'] },
      { name: 'supervisor', patterns: ['supervisor', 'supervisor-postgres'] },
      { name: 'memory', patterns: ['memory', 'memory-stm', 'memory-stm-db'] }
    ];
    
    const missingPlugins: string[] = [];
    const foundPluginNames = plugins.map(p => (p.name || p.id || '').toLowerCase());
    
    criticalPlugins.forEach(({ name, patterns }) => {
      const found = patterns.some(pattern => 
        foundPluginNames.some(foundName => 
          foundName.includes(pattern.toLowerCase())
        )
      );
      if (!found) {
        missingPlugins.push(name);
      }
    });

    if (missingPlugins.length > 0 && plugins.length > 0) {
      // Only report as critical if we successfully fetched plugins but some are missing
      problems.push({
        id: 'missing-plugins',
        severity: 'critical',
        title: `Missing Critical Plugins: ${missingPlugins.join(', ')}`,
        description: `Required plugins are not available: ${missingPlugins.join(', ')}. Core functionality may be impaired.`,
        component: 'Plugins',
        detectedAt: new Date(),
        solution: 'Ensure all required plugins are properly installed and initialized.',
        steps: [
          'Check plugin installation in package.json',
          'Verify plugins are loaded during startup',
          'Check plugin initialization logs',
          'Restart API service to reload plugins',
          'Verify plugin configuration is correct',
          `Available plugins: ${foundPluginNames.join(', ') || 'None detected'}`
        ],
      });
    } else if (missingPlugins.length > 0 && plugins.length === 0) {
      // If we couldn't fetch plugins at all, it might be a different issue
      // Don't add this as a separate problem since it's likely covered by readiness check
    }

    // Endpoint failures
    const failedEndpoints = endpoints.filter(e => e.status === 'error');
    if (failedEndpoints.length > 0) {
      problems.push({
        id: 'endpoint-failures',
        severity: failedEndpoints.length === endpoints.length ? 'critical' : 'warning',
        title: `${failedEndpoints.length} Endpoint(s) Unreachable`,
        description: `The following endpoints are not responding: ${failedEndpoints.map(e => e.name).join(', ')}`,
        component: 'API Surface',
        detectedAt: new Date(),
        solution: 'Check endpoint implementation and server logs for errors.',
        steps: [
          'Review API server logs for errors',
          'Check endpoint route definitions',
          'Verify middleware configuration',
          'Test endpoints individually',
          'Check for CORS or network issues'
        ],
      });
    }

    // High latency warnings
    const slowEndpoints = endpoints.filter(e => e.latency && e.latency > 1000);
    if (slowEndpoints.length > 0) {
      problems.push({
        id: 'high-latency',
        severity: 'warning',
        title: 'High API Response Latency',
        description: `Some endpoints are responding slowly: ${slowEndpoints.map(e => `${e.name} (${e.latency}ms)`).join(', ')}`,
        component: 'Performance',
        detectedAt: new Date(),
        solution: 'Optimize endpoint performance and check database query performance.',
        steps: [
          'Check database query performance',
          'Review endpoint implementation for bottlenecks',
          'Check system resource usage (CPU, Memory)',
          'Consider adding caching for frequently accessed data',
          'Monitor performance metrics over time'
        ],
      });
    }

    return problems;
  };

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    const problems: Problem[] = [];
    const insights: string[] = [];

    try {
      // 1. Check /health endpoint
      const healthResult = await ultraSecureApiClient.healthCheck();
      const healthStatus: CheckStatus = 
        healthResult.status === 'healthy' ? 'success' :
        healthResult.status === 'unhealthy' ? 'error' : 'error';

      if (healthStatus === 'error') {
        insights.push('Health endpoint is failing. The system may be down or unreachable.');
      } else if (healthResult.data) {
        insights.push('Health check passed. Core systems are operational.');
      }

      // 2. Check /ready endpoint
      const readyResult = await ultraSecureApiClient.readyCheck();
      const readyStatus: CheckStatus = 
        readyResult.status === 'ready' ? 'success' :
        readyResult.status === 'not_ready' ? 'warning' : 'error';

      if (readyStatus === 'error') {
        insights.push('Ready endpoint is unreachable. Cannot determine if system is ready.');
      } else if (readyStatus === 'warning') {
        insights.push('System is not ready. Dependencies may not be initialized.');
      } else {
        insights.push('System is ready and accepting requests.');
      }

      // 3. Determine global status
      let globalStatus: SystemStatus = 'down';
      if (healthStatus === 'error') {
        globalStatus = 'down';
      } else if (readyStatus === 'error' || readyStatus === 'warning') {
        globalStatus = 'degraded';
      } else {
        globalStatus = 'operational';
      }

      // 4. Check plugins
      const pluginStatuses: PluginStatus[] = [];
      try {
        const pluginsResult = await ultraSecureApiClient.checkPlugins();
        if (pluginsResult.status === 'available' && pluginsResult.plugins) {
          pluginsResult.plugins.forEach((p: any) => {
            pluginStatuses.push({
              name: p.name || p.id || 'Unknown',
              available: true,
              status: p.health?.status || 'healthy',
              details: p,
            });
          });
        }
      } catch (error) {
        insights.push('Unable to check plugin status. Plugin endpoint may be unavailable.');
      }

      // 5. Check additional endpoints
      const endpointsToCheck: { name: string; path: string }[] = [
        { name: 'Root', path: '/' },
        { name: 'Health', path: '/health' },
        { name: 'Ready', path: '/ready' },
      ];

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

      // 6. Detect problems
      const detectedProblems = detectProblems(
        healthResult.data,
        readyResult.data,
        pluginStatuses,
        endpointChecks
      );
      problems.push(...detectedProblems);

      // 7. Extract additional info
      const uptime = healthResult.data?.uptime;
      const version = healthResult.data?.version;

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
        uptime,
        version,
      });

      setLastChecked(new Date());
    } catch (error) {
      setDiagnostics((prev: SystemDiagnostics) => ({
        ...prev,
        globalStatus: 'down',
        healthStatus: 'error',
        readyStatus: 'error',
        problems: [{
          id: 'connection-error',
          severity: 'critical',
          title: 'Connection Error',
          description: 'Failed to connect to the API. Check network connectivity and API base URL configuration.',
          component: 'Network',
          detectedAt: new Date(),
          solution: 'Verify API base URL is correct and service is running.',
          steps: [
            'Check NEXT_PUBLIC_API_BASE_URL environment variable',
            'Verify API service is deployed and running',
            'Check network connectivity',
            'Review API service logs in Railway',
            'Test API endpoint directly in browser'
          ],
        }],
      }));
    } finally {
      setLoading(false);
    }
  }, [refreshKey]);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 30000); // Auto-refresh every 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Stats calculation
  const stats = useMemo<StatCard[]>(() => {
    if (overviewLoading || !overview?.data) return [];

    const data = overview.data;
    return [
      {
        title: 'Total Orchestrations',
        value: data.orchestrations?.total || 0,
        change: data.orchestrations?.active || 0,
        trend: 'up',
        icon: <Activity className="h-5 w-5" />,
        color: 'text-blue-400',
        subtitle: `${data.orchestrations?.active || 0} active`,
      },
      {
        title: 'Active Agents',
        value: data.agents?.active || 0,
        change: data.agents?.total || 0,
        trend: 'up',
        icon: <Brain className="h-5 w-5" />,
        color: 'text-purple-400',
        subtitle: `of ${data.agents?.total || 0} total`,
      },
      {
        title: 'Requests/Min',
        value: Math.round(data.performance?.requestsPerMinute || 0),
        change: data.performance?.averageResponseTime || 0,
        trend: data.performance?.requestsPerMinute > 10 ? 'up' : 'neutral',
        icon: <TrendingUp className="h-5 w-5" />,
        color: 'text-emerald-400',
        subtitle: `${Math.round(data.performance?.averageResponseTime || 0)}ms avg`,
      },
      {
        title: 'Monthly Cost',
        value: `$${(data.costs?.thisMonth || 0).toFixed(2)}`,
        change: ((data.costs?.thisMonth || 0) - (data.costs?.total || 0)),
        trend: 'neutral',
        icon: <DollarSign className="h-5 w-5" />,
        color: 'text-amber-400',
        subtitle: `Total: $${(data.costs?.total || 0).toFixed(2)}`,
      },
    ];
  }, [overview, overviewLoading]);

  const getSystemStatusBadge = (status: SystemStatus) => {
    const configs = {
      operational: {
        bg: 'bg-emerald-500/20 border-emerald-500/30',
        text: 'text-emerald-400',
        label: 'OPERATIONAL',
        icon: <CheckCircle2 className="h-4 w-4" />,
        pulse: 'status-pulse',
      },
      degraded: {
        bg: 'bg-amber-500/20 border-amber-500/30',
        text: 'text-amber-400',
        label: 'DEGRADED',
        icon: <AlertTriangle className="h-4 w-4" />,
        pulse: 'animate-pulse',
      },
      critical: {
        bg: 'bg-red-500/20 border-red-500/30',
        text: 'text-red-400',
        label: 'CRITICAL',
        icon: <XCircle className="h-4 w-4" />,
        pulse: 'animate-pulse',
      },
      down: {
        bg: 'bg-red-500/20 border-red-500/30',
        text: 'text-red-400',
        label: 'DOWN',
        icon: <XCircle className="h-4 w-4" />,
        pulse: 'animate-pulse',
      },
    };

    const config = configs[status];
    return (
      <Badge className={`${config.bg} ${config.text} text-base px-5 py-2 font-semibold shadow-lg border flex items-center gap-2`}>
        <div className={`w-2 h-2 rounded-full ${config.text.replace('text-', 'bg-')} ${config.pulse}`}></div>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const getSeverityIcon = (severity: Severity) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-400" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-400" />;
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
    }
  };

  const getSeverityColor = (severity: Severity) => {
    switch (severity) {
      case 'critical':
        return 'from-red-500/20 to-red-500/10 border-red-500/30';
      case 'warning':
        return 'from-amber-500/20 to-amber-500/10 border-amber-500/30';
      case 'info':
        return 'from-blue-500/20 to-blue-500/10 border-blue-500/30';
      case 'success':
        return 'from-emerald-500/20 to-emerald-500/10 border-emerald-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl relative z-10">
        {/* Header */}
        <div className="mb-8 fade-in">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-6">
            <div className="flex items-center gap-5 flex-shrink-0">
              <div className="p-4 bg-gradient-to-br from-blue-500/30 to-purple-500/30 rounded-2xl backdrop-blur-sm border-2 border-blue-500/40 shadow-lg shadow-blue-500/20">
                <Sparkles className="h-10 w-10 text-blue-300" />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent leading-tight mb-2">
                  AI Execution Platform
                </h1>
                <p className="text-slate-300 text-lg md:text-xl mt-2 font-medium">Real-time System Health & Performance Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-4 md:px-5 py-2 md:py-3 rounded-xl border-2 transition-all font-semibold text-sm md:text-base whitespace-nowrap ${
                  autoRefresh
                    ? 'bg-emerald-500/25 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-800/70 border-slate-600/50 text-slate-400 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-2">
                  <RefreshCw className={`h-4 w-4 md:h-5 md:w-5 ${autoRefresh ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Auto-refresh </span>{autoRefresh ? 'ON' : 'OFF'}
                </div>
              </button>
              <button
                onClick={() => setRefreshKey(prev => prev + 1)}
                disabled={loading}
                className="px-5 md:px-6 py-2 md:py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-xl hover:shadow-2xl hover:scale-105 disabled:hover:scale-100 text-sm md:text-base"
              >
                <RefreshCw className={`h-4 w-4 md:h-5 md:w-5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Global Status Hero Card */}
          <Card className="glass-effect border-slate-700/50 shadow-2xl card-glow fade-in mb-8">
            <CardHeader className="pb-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-5 flex-1">
                  <div className="p-4 bg-gradient-to-br from-emerald-500/25 to-blue-500/25 rounded-2xl border border-emerald-500/40 shadow-lg shadow-emerald-500/20 flex-shrink-0">
                    <Activity className="h-8 w-8 text-emerald-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-3xl md:text-4xl font-extrabold mb-2 bg-gradient-to-r from-white via-emerald-100 to-blue-100 bg-clip-text text-transparent">
                      System Status
                    </CardTitle>
                    <CardDescription className="text-slate-200 mt-2 text-base md:text-lg font-medium">
                      {loading ? 'Evaluating system state...' : 
                       diagnostics.globalStatus === 'operational' ? 'All systems operational and healthy' :
                       diagnostics.globalStatus === 'degraded' ? 'System operational with degraded performance' :
                       diagnostics.globalStatus === 'critical' ? 'Critical issues detected - immediate attention required' :
                       'System is down - core services not responding'}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {loading ? (
                    <Badge variant="warning" className="text-base md:text-lg px-5 md:px-6 py-2 md:py-3 font-bold w-full md:w-auto justify-center">
                      <Clock className="h-4 w-4 md:h-5 md:w-5 mr-2 animate-spin" />
                      Checking...
                    </Badge>
                  ) : (
                    getSystemStatusBadge(diagnostics.globalStatus)
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="group flex items-center gap-5 p-6 bg-gradient-to-br from-slate-900/90 to-slate-800/90 rounded-2xl border-2 border-slate-700/60 hover:border-emerald-500/60 hover:shadow-xl hover:shadow-emerald-500/20 transition-all duration-300 cursor-pointer">
                  <div className={`p-4 rounded-xl shadow-lg ${
                    diagnostics.healthStatus === 'success' ? 'bg-emerald-500/25 border border-emerald-400/40' : 
                    diagnostics.healthStatus === 'error' ? 'bg-red-500/25 border border-red-400/40' : 
                    'bg-amber-500/25 border border-amber-400/40'
                  }`}>
                    {diagnostics.healthStatus === 'success' ? (
                      <CheckCircle2 className="h-8 w-8 text-emerald-300" />
                    ) : diagnostics.healthStatus === 'error' ? (
                      <XCircle className="h-8 w-8 text-red-300" />
                    ) : (
                      <Clock className="h-8 w-8 text-amber-300 animate-spin" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xl mb-2 text-white">Health Check</div>
                    <div className={`text-base font-semibold ${
                      diagnostics.healthStatus === 'success' ? 'text-emerald-300' :
                      diagnostics.healthStatus === 'error' ? 'text-red-300' : 'text-amber-300'
                    }`}>
                      {diagnostics.healthStatus === 'success' ? 'All systems healthy' :
                       diagnostics.healthStatus === 'error' ? 'System unhealthy' : 'Checking status...'}
                    </div>
                    {diagnostics.uptime && (
                      <div className="text-sm text-slate-300 mt-2 font-medium">Uptime: {Math.floor(diagnostics.uptime / 3600)}h {(Math.floor(diagnostics.uptime / 60) % 60)}m</div>
                    )}
                  </div>
                </div>
                <div className="group flex items-center gap-5 p-6 bg-gradient-to-br from-slate-900/90 to-slate-800/90 rounded-2xl border-2 border-slate-700/60 hover:border-amber-500/60 hover:shadow-xl hover:shadow-amber-500/20 transition-all duration-300 cursor-pointer">
                  <div className={`p-4 rounded-xl shadow-lg ${
                    diagnostics.readyStatus === 'success' ? 'bg-emerald-500/25 border border-emerald-400/40' : 
                    diagnostics.readyStatus === 'error' ? 'bg-red-500/25 border border-red-400/40' : 
                    'bg-amber-500/25 border border-amber-400/40'
                  }`}>
                    {diagnostics.readyStatus === 'success' ? (
                      <CheckCircle2 className="h-8 w-8 text-emerald-300" />
                    ) : diagnostics.readyStatus === 'error' ? (
                      <XCircle className="h-8 w-8 text-red-300" />
                    ) : (
                      <Clock className="h-8 w-8 text-amber-300 animate-spin" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xl mb-2 text-white">Readiness Check</div>
                    <div className={`text-base font-semibold ${
                      diagnostics.readyStatus === 'success' ? 'text-emerald-300' :
                      diagnostics.readyStatus === 'error' ? 'text-red-300' : 'text-amber-300'
                    }`}>
                      {diagnostics.readyStatus === 'success' ? 'Ready for requests' :
                       diagnostics.readyStatus === 'warning' ? 'Not ready yet' :
                       diagnostics.readyStatus === 'error' ? 'Readiness check failed' : 'Checking status...'}
                    </div>
                    {diagnostics.version && (
                      <div className="text-sm text-slate-300 mt-2 font-medium">Version: {diagnostics.version}</div>
                    )}
                  </div>
                </div>
                <div className="group flex items-center gap-5 p-6 bg-gradient-to-br from-slate-900/90 to-slate-800/90 rounded-2xl border-2 border-slate-700/60 hover:border-blue-500/60 hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-300 cursor-pointer">
                  <div className="p-4 rounded-xl shadow-lg bg-blue-500/25 border border-blue-400/40">
                    <Server className="h-8 w-8 text-blue-300" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-xl mb-2 text-white">API Endpoints</div>
                    <div className="text-base font-semibold text-slate-200">
                      {diagnostics.endpoints.filter(e => e.status === 'success').length} / {diagnostics.endpoints.length} online
                    </div>
                    <div className="text-sm text-slate-300 mt-2 font-medium">
                      Avg latency: {Math.round(diagnostics.endpoints.reduce((acc, e) => acc + (e.latency || 0), 0) / (diagnostics.endpoints.length || 1))}ms
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Grid */}
        {!overviewLoading && stats.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 fade-in">
            {stats.map((stat, idx) => (
              <Card key={idx} className="glass-effect border-slate-700/50 shadow-xl card-glow hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 cursor-pointer group">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wider">{stat.title}</CardTitle>
                  <div className={`${stat.color} p-2 rounded-lg bg-slate-800/50 group-hover:scale-110 transition-transform`}>
                    {stat.icon}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-extrabold mb-2 text-white">{stat.value}</div>
                  {stat.subtitle && (
                    <p className="text-sm text-slate-300 mt-1 font-medium">{stat.subtitle}</p>
                  )}
                  {stat.change !== undefined && (
                    <div className={`flex items-center text-sm mt-3 font-semibold ${
                      stat.trend === 'up' ? 'text-emerald-300' :
                      stat.trend === 'down' ? 'text-red-300' : 'text-slate-400'
                    }`}>
                      {stat.trend === 'up' ? <ArrowUpRight className="h-4 w-4 mr-1" /> :
                       stat.trend === 'down' ? <ArrowDownRight className="h-4 w-4 mr-1" /> :
                       <Minus className="h-4 w-4 mr-1" />}
                      {typeof stat.change === 'number' ? `${stat.change > 0 ? '+' : ''}${stat.change}` : stat.change}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Problems & Solutions - Intelligent Troubleshooting */}
        {diagnostics.problems.length > 0 && (
          <Card className="glass-effect border-slate-700/50 shadow-xl mb-6 fade-in">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-lg border border-red-500/30">
                  <AlertCircle className="h-6 w-6 text-red-400" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold">Intelligent Problem Detection</CardTitle>
                  <CardDescription className="text-slate-300">
                    {diagnostics.problems.length} {diagnostics.problems.length === 1 ? 'issue' : 'issues'} detected with solutions
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {diagnostics.problems.map((problem) => (
                  <div
                    key={problem.id}
                    className={`p-6 bg-gradient-to-r ${getSeverityColor(problem.severity)} rounded-xl border hover:shadow-lg transition-all`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="mt-1">{getSeverityIcon(problem.severity)}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-lg font-semibold text-white">{problem.title}</h4>
                          <Badge variant={problem.severity === 'critical' ? 'error' : problem.severity === 'warning' ? 'warning' : 'default'}>
                            {problem.severity.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-300 mb-3">{problem.description}</p>
                        <div className="mb-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400 mb-2">
                            <Lightbulb className="h-4 w-4" />
                            Solution
                          </div>
                          <p className="text-sm text-slate-200 mb-3">{problem.solution}</p>
                          <div className="flex items-center gap-2 text-sm font-semibold text-blue-400 mb-2">
                            <ListChecks className="h-4 w-4" />
                            Resolution Steps
                          </div>
                          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-300">
                            {problem.steps.map((step, idx) => (
                              <li key={idx}>{step}</li>
                            ))}
                          </ol>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-3 pt-3 border-t border-slate-700/50">
                          <Settings className="h-3 w-3" />
                          <span>Component: {problem.component}</span>
                          <span className="mx-2">•</span>
                          <Clock className="h-3 w-3" />
                          <span>Detected: {problem.detectedAt.toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* System Components Grid */}
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
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50">
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
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50">
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
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      {diagnostics.problems.filter(p => p.severity === 'critical').length === 0 ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400" />
                      )}
                      <span className="font-medium">Runtime Exceptions</span>
                    </div>
                    <Badge variant={diagnostics.problems.filter(p => p.severity === 'critical').length === 0 ? 'success' : 'error'}>
                      {diagnostics.problems.filter(p => p.severity === 'critical').length === 0 ? 'None' : `${diagnostics.problems.filter(p => p.severity === 'critical').length} critical`}
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
              {loading || pluginsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-14 bg-slate-900/50 rounded-lg animate-pulse shimmer" />
                  ))}
                </div>
              ) : diagnostics.plugins.length > 0 ? (
                <div className="space-y-3">
                  {diagnostics.plugins.map((plugin, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50">
                      <div className="flex items-center gap-3">
                        {plugin.available && plugin.status !== 'critical' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-400" />
                        )}
                        <span className="font-medium">{plugin.name}</span>
                      </div>
                      <Badge variant={plugin.available && plugin.status !== 'critical' ? 'success' : 'error'}>
                        {plugin.status || (plugin.available ? 'Available' : 'Missing')}
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
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50">
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
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      {diagnostics.healthData?.checks?.redis !== false ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-amber-400" />
                      )}
                      <span className="font-medium">Redis Cache</span>
                    </div>
                    <Badge variant={diagnostics.healthData?.checks?.redis !== false ? 'success' : 'warning'}>
                      {diagnostics.healthData?.checks?.redis !== false ? 'Connected' : 'Unavailable'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-900/80 to-slate-800/80 rounded-lg border border-slate-700/50">
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
                </div>
              )}
            </CardContent>
          </Card>

          {/* API Surface */}
          <Card className="glass-effect border-slate-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 fade-in">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-lg border border-emerald-500/30">
                  <Network className="h-5 w-5 text-emerald-400" />
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
                      {diagnostics.endpoints.map((endpoint, idx) => (
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

        {/* Insights */}
        {diagnostics.insights.length > 0 && (
          <Card className="mb-6 glass-effect border-slate-700/50 shadow-xl fade-in">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg border border-blue-500/30">
                  <Lightbulb className="h-5 w-5 text-blue-400" />
                </div>
                <CardTitle className="text-xl font-bold">System Insights</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {diagnostics.insights.map((insight, idx) => (
                  <div key={idx} className="p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-200">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{insight}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
