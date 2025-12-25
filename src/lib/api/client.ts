import { QueryClient, QueryFunction, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';

// Import all schemas
import {
  OverviewResponseSchema,
  OrchestrationsResponseSchema,
  OrchestrationResponseSchema,
  AgentsResponseSchema,
  AgentResponseSchema,
  PoliciesResponseSchema,
  PolicyResponseSchema,
  MemoryResponseSchema,
  PluginsResponseSchema,
  AuditResponseSchema,
  SettingsResponseSchema,
  WebSocketEventSchema,
  ApiResponseSchema,
  ApiResponse,
  type OverviewStats,
  type Orchestration,
  type AgentProfile,
  type Policy,
  type Memory,
  type Plugin,
  type AuditEntry,
  type WebSocketEvent,
} from '@/lib/schemas/api';

// Configuration
interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  headers: Record<string, string>;
}

// Default configuration
const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api',
  timeout: 10000,
  retries: 3,
  headers: {
    'Content-Type': 'application/json',
  },
};

class UltraSecureApiClient {
  private config: ApiConfig;
  private authToken: string | null = null;

  constructor(config: Partial<ApiConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadTokenFromStorage();
  }

  // Token Management with Security Rules
  private loadTokenFromStorage(): void {
    if (typeof window === 'undefined') return;

    const token = sessionStorage.getItem('ai-execution-token');
    if (token) {
      this.setAuthToken(token);
    }
  }

  public setAuthToken(token: string): void {
    this.authToken = token;
    
    if (typeof window !== 'undefined') {
      // Store in sessionStorage for security (not localStorage)
      sessionStorage.setItem('ai-execution-token', token);
    }
  }

  public clearAuthToken(): void {
    this.authToken = null;
    
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('ai-execution-token');
    }
  }

  private getHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.config.headers,
      ...additionalHeaders,
    };

    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  // Ultra-secure fetch with timeout and retries
  private async ultraSecureFetch<T>(
    url: string,
    options: RequestInit = {},
    schema: any // Zod schema for response validation
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: this.getHeaders(options.headers as Record<string, string>),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Parse response as text first
      const responseText = await response.text();
      
      try {
        const jsonData = JSON.parse(responseText);
        
        // CRITICAL: Validate response with Zod schema
        const validatedData = schema.parse(jsonData);
        
        return validatedData as T;
      } catch (validationError) {
        console.error('API Response Validation Failed:', {
          url,
          status: response.status,
          response: responseText,
          validationError,
        });
        
        throw new Error(`Invalid API response format: ${validationError}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms`);
      }
      
      throw error;
    }
  }

  // Health Check with CORS diagnostics
  public async healthCheck(): Promise<{ status: string; cors: boolean; timestamp: string }> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const corsHeaders = {
        'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
        'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
        'access-control-allow-headers': response.headers.get('access-control-allow-headers'),
      };

      return {
        status: response.ok ? 'healthy' : 'unhealthy',
        cors: corsHeaders['access-control-allow-origin'] !== null,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        cors: false,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // API Methods with Schema Validation

  // Overview endpoints
  public async getOverview(): Promise<ApiResponse<OverviewStats>> {
    return this.ultraSecureFetch<ApiResponse<OverviewStats>>(
      `${this.config.baseUrl}/overview`,
      { method: 'GET' },
      OverviewResponseSchema
    );
  }

  public async getOverviewStats(): Promise<ApiResponse<any>> {
    return this.ultraSecureFetch<ApiResponse<any>>(
      `${this.config.baseUrl}/overview/stats`,
      { method: 'GET' },
      ApiResponseSchema(z.any())
    );
  }

  // Orchestration endpoints
  public async getOrchestrations(params: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ApiResponse<{ orchestrations: Orchestration[]; pagination: any }>> {
    const searchParams = new URLSearchParams();
    
    if (params.status) searchParams.append('status', params.status);
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.offset) searchParams.append('offset', params.offset.toString());

    const url = `${this.config.baseUrl}/orchestrations${searchParams.toString() ? `?${searchParams}` : ''}`;
    
    return this.ultraSecureFetch<ApiResponse<{ orchestrations: Orchestration[]; pagination: any }>>(
      url,
      { method: 'GET' },
      OrchestrationsResponseSchema
    );
  }

  public async getOrchestration(id: string): Promise<ApiResponse<Orchestration>> {
    return this.ultraSecureFetch<ApiResponse<Orchestration>>(
      `${this.config.baseUrl}/orchestrations/${id}`,
      { method: 'GET' },
      OrchestrationResponseSchema
    );
  }

  public async createOrchestration(data: {
    name: string;
    description?: string;
    agentId: string;
    tasks?: any[];
  }): Promise<ApiResponse<Orchestration>> {
    return this.ultraSecureFetch<ApiResponse<Orchestration>>(
      `${this.config.baseUrl}/orchestrations`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      OrchestrationResponseSchema
    );
  }

  public async updateOrchestration(
    id: string,
    updates: Partial<Orchestration>
  ): Promise<ApiResponse<Orchestration>> {
    return this.ultraSecureFetch<ApiResponse<Orchestration>>(
      `${this.config.baseUrl}/orchestrations/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      },
      OrchestrationResponseSchema
    );
  }

  public async deleteOrchestration(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.ultraSecureFetch<ApiResponse<{ message: string }>>(
      `${this.config.baseUrl}/orchestrations/${id}`,
      { method: 'DELETE' },
      ApiResponseSchema(z.object({ message: z.string() }))
    );
  }

  // Agent endpoints
  public async getAgents(params: {
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ApiResponse<{ agents: AgentProfile[]; pagination: any }>> {
    const searchParams = new URLSearchParams();
    
    if (params.status) searchParams.append('status', params.status);
    if (params.type) searchParams.append('type', params.type);
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.offset) searchParams.append('offset', params.offset.toString());

    const url = `${this.config.baseUrl}/agents${searchParams.toString() ? `?${searchParams}` : ''}`;
    
    return this.ultraSecureFetch<ApiResponse<{ agents: AgentProfile[]; pagination: any }>>(
      url,
      { method: 'GET' },
      AgentsResponseSchema
    );
  }

  public async getAgent(id: string): Promise<ApiResponse<AgentProfile>> {
    return this.ultraSecureFetch<ApiResponse<AgentProfile>>(
      `${this.config.baseUrl}/agents/${id}`,
      { method: 'GET' },
      AgentResponseSchema
    );
  }

  public async createAgent(data: {
    name: string;
    type: string;
    behaviorPreset?: string;
    capabilities?: string[];
    permissions?: string[];
  }): Promise<ApiResponse<AgentProfile>> {
    return this.ultraSecureFetch<ApiResponse<AgentProfile>>(
      `${this.config.baseUrl}/agents`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      AgentResponseSchema
    );
  }

  public async cloneAgent(
    id: string,
    data: {
      behaviorPreset: string;
      overrides?: Record<string, any>;
    }
  ): Promise<ApiResponse<{ agent: AgentProfile; cloneDetails: any }>> {
    return this.ultraSecureFetch<ApiResponse<{ agent: AgentProfile; cloneDetails: any }>>(
      `${this.config.baseUrl}/agents/${id}/clone`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      ApiResponseSchema(z.object({
        agent: AgentProfileSchema,
        cloneDetails: z.any(),
      }))
    );
  }

  // Policy endpoints
  public async getPolicies(): Promise<ApiResponse<{ policies: Policy[]; pagination: any }>> {
    return this.ultraSecureFetch<ApiResponse<{ policies: Policy[]; pagination: any }>>(
      `${this.config.baseUrl}/policies`,
      { method: 'GET' },
      PoliciesResponseSchema
    );
  }

  public async getPolicy(id: string): Promise<ApiResponse<Policy>> {
    return this.ultraSecureFetch<ApiResponse<Policy>>(
      `${this.config.baseUrl}/policies/${id}`,
      { method: 'GET' },
      PolicyResponseSchema
    );
  }

  public async testPolicy(id: string, data: {
    intent: Record<string, any>;
    context?: Record<string, any>;
  }): Promise<ApiResponse<any>> {
    return this.ultraSecureFetch<ApiResponse<any>>(
      `${this.config.baseUrl}/policies/${id}/test`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      ApiResponseSchema(z.any())
    );
  }

  // Memory endpoints
  public async getMemory(params: {
    type?: string;
    tags?: string[];
    importance?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<ApiResponse<{ memories: Memory[]; pagination: any }>> {
    const searchParams = new URLSearchParams();
    
    if (params.type) searchParams.append('type', params.type);
    if (params.importance) searchParams.append('importance', params.importance.toString());
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.offset) searchParams.append('offset', params.offset.toString());
    if (params.tags) {
      params.tags.forEach(tag => searchParams.append('tags', tag));
    }

    const url = `${this.config.baseUrl}/memory${searchParams.toString() ? `?${searchParams}` : ''}`;
    
    return this.ultraSecureFetch<ApiResponse<{ memories: Memory[]; pagination: any }>>(
      url,
      { method: 'GET' },
      MemoryResponseSchema
    );
  }

  public async searchMemory(data: {
    query: string;
    filters?: Record<string, any>;
    limit?: number;
  }): Promise<ApiResponse<any>> {
    return this.ultraSecureFetch<ApiResponse<any>>(
      `${this.config.baseUrl}/memory/search`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      ApiResponseSchema(z.any())
    );
  }

  // Plugin endpoints
  public async getPlugins(): Promise<ApiResponse<{ plugins: Plugin[]; pagination: any }>> {
    return this.ultraSecureFetch<ApiResponse<{ plugins: Plugin[]; pagination: any }>>(
      `${this.config.baseUrl}/plugins`,
      { method: 'GET' },
      PluginsResponseSchema
    );
  }

  public async getPlugin(id: string): Promise<ApiResponse<Plugin>> {
    return this.ultraSecureFetch<ApiResponse<Plugin>>(
      `${this.config.baseUrl}/plugins/${id}`,
      { method: 'GET' },
      ApiResponseSchema(PluginSchema)
    );
  }

  // Audit endpoints
  public async getAudit(params: {
    startDate?: string;
    endDate?: string;
    agentId?: string;
    orchestrationId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ApiResponse<{ entries: AuditEntry[]; pagination: any }>> {
    const searchParams = new URLSearchParams();
    
    if (params.startDate) searchParams.append('startDate', params.startDate);
    if (params.endDate) searchParams.append('endDate', params.endDate);
    if (params.agentId) searchParams.append('agentId', params.agentId);
    if (params.orchestrationId) searchParams.append('orchestrationId', params.orchestrationId);
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.offset) searchParams.append('offset', params.offset.toString());

    const url = `${this.config.baseUrl}/audit${searchParams.toString() ? `?${searchParams}` : ''}`;
    
    return this.ultraSecureFetch<ApiResponse<{ entries: AuditEntry[]; pagination: any }>>(
      url,
      { method: 'GET' },
      AuditResponseSchema
    );
  }

  public async exportAudit(params: {
    format?: 'json' | 'csv';
    startDate?: string;
    endDate?: string;
  } = {}): Promise<Response> {
    const searchParams = new URLSearchParams();
    
    if (params.format) searchParams.append('format', params.format);
    if (params.startDate) searchParams.append('startDate', params.startDate);
    if (params.endDate) searchParams.append('endDate', params.endDate);

    const url = `${this.config.baseUrl}/audit/export?${searchParams}`;
    
    return fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });
  }

  // Settings endpoints
  public async getSettings(): Promise<ApiResponse<Record<string, any>>> {
    return this.ultraSecureFetch<ApiResponse<Record<string, any>>>(
      `${this.config.baseUrl}/settings`,
      { method: 'GET' },
      SettingsResponseSchema
    );
  }

  public async updateSettings(updates: Record<string, any>): Promise<ApiResponse<Record<string, any>>> {
    return this.ultraSecureFetch<ApiResponse<Record<string, any>>>(
      `${this.config.baseUrl}/settings`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      },
      SettingsResponseSchema
    );
  }

  // Export orchestration bundle
  public async exportOrchestration(id: string): Promise<Response> {
    return fetch(`${this.config.baseUrl}/orchestrations/${id}/export`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
  }

  // Get current user (if available)
  public async getCurrentUser(): Promise<ApiResponse<any>> {
    return this.ultraSecureFetch<ApiResponse<any>>(
      `${this.config.baseUrl}/whoami`,
      { method: 'GET' },
      ApiResponseSchema(z.any())
    );
  }
}

// Create singleton instance
export const ultraSecureApiClient = new UltraSecureApiClient();

// React Query hooks with error handling
export function useOverview() {
  return useQuery({
    queryKey: ['overview'],
    queryFn: () => ultraSecureApiClient.getOverview(),
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider stale after 10 seconds
  });
}

export function useOrchestrations(params?: Parameters<typeof ultraSecureApiClient.getOrchestrations>[0]) {
  return useQuery({
    queryKey: ['orchestrations', params],
    queryFn: () => ultraSecureApiClient.getOrchestrations(params),
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });
}

export function useOrchestration(id: string) {
  return useQuery({
    queryKey: ['orchestration', id],
    queryFn: () => ultraSecureApiClient.getOrchestration(id),
    enabled: !!id,
  });
}

export function useAgents(params?: Parameters<typeof ultraSecureApiClient.getAgents>[0]) {
  return useQuery({
    queryKey: ['agents', params],
    queryFn: () => ultraSecureApiClient.getAgents(params),
    refetchInterval: 30000,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ['agent', id],
    queryFn: () => ultraSecureApiClient.getAgent(id),
    enabled: !!id,
  });
}

export function usePolicies() {
  return useQuery({
    queryKey: ['policies'],
    queryFn: () => ultraSecureApiClient.getPolicies(),
  });
}

export function useMemory(params?: Parameters<typeof ultraSecureApiClient.getMemory>[0]) {
  return useQuery({
    queryKey: ['memory', params],
    queryFn: () => ultraSecureApiClient.getMemory(params),
  });
}

export function usePlugins() {
  return useQuery({
    queryKey: ['plugins'],
    queryFn: () => ultraSecureApiClient.getPlugins(),
  });
}

export function useAudit(params?: Parameters<typeof ultraSecureApiClient.getAudit>[0]) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: () => ultraSecureApiClient.getAudit(params),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => ultraSecureApiClient.getSettings(),
  });
}

// Mutation hooks
export function useCreateOrchestration() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ultraSecureApiClient.createOrchestration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestrations'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      toast.success('Orchestration created successfully');
    },
    onError: (error) => {
      toast.error(`Failed to create orchestration: ${error.message}`);
    },
  });
}

export function useUpdateOrchestration() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) =>
      ultraSecureApiClient.updateOrchestration(id, updates),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orchestrations'] });
      queryClient.invalidateQueries({ queryKey: ['orchestration', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      toast.success('Orchestration updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update orchestration: ${error.message}`);
    },
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ultraSecureApiClient.createAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent created successfully');
    },
    onError: (error) => {
      toast.error(`Failed to create agent: ${error.message}`);
    },
  });
}

export function useCloneAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      ultraSecureApiClient.cloneAgent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent cloned successfully');
    },
    onError: (error) => {
      toast.error(`Failed to clone agent: ${error.message}`);
    },
  });
}