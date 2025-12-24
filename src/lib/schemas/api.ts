import { z } from 'zod';

// Base schemas for common types
export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    timestamp: z.string().datetime(),
    message: z.string().optional(),
    error: z.string().optional(),
  });

export const PaginationSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});

// User and Authentication schemas
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['owner', 'admin', 'operator', 'auditor', 'viewer']),
  createdAt: z.string().datetime(),
  lastLogin: z.string().datetime().optional(),
  isActive: z.boolean(),
});

export const AuthSessionSchema = z.object({
  token: z.string(),
  user: UserSchema,
  expiresAt: z.string().datetime(),
  environment: z.enum(['development', 'staging', 'production']),
});

// Overview and Dashboard schemas
export const SystemHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'critical']),
  components: z.record(z.enum(['healthy', 'degraded', 'critical'])),
  lastCheck: z.string().datetime(),
  uptime: z.number(),
  version: z.string(),
});

export const OverviewStatsSchema = z.object({
  orchestrations: z.object({
    total: z.number(),
    active: z.number(),
    completed: z.number(),
    failed: z.number(),
  }),
  agents: z.object({
    total: z.number(),
    active: z.number(),
    idle: z.number(),
    offline: z.number(),
  }),
  system: SystemHealthSchema,
  performance: z.object({
    requestsPerMinute: z.number(),
    averageResponseTime: z.number(),
    errorRate: z.number(),
    throughput: z.number(),
  }),
  costs: z.object({
    total: z.number(),
    thisMonth: z.number(),
    breakdown: z.object({
      llm: z.number(),
      tools: z.number(),
      storage: z.number(),
    }),
  }),
});

// Orchestration schemas
export const OrchestrationStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'waiting_approval']),
  progress: z.number().min(0).max(100),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  estimatedCompletion: z.string().datetime().optional(),
  agentId: z.string(),
  agentName: z.string(),
  type: z.enum(['llm_request', 'tool_request', 'condition', 'approval']),
});

export const ExecutionPlanSchema = z.object({
  id: z.string(),
  orchestrationId: z.string(),
  steps: z.array(OrchestrationStepSchema),
  allowed: z.boolean(),
  decision: z.enum(['allow', 'deny', 'ask', 'autofix']),
  gates: z.array(z.string()),
  toolAllowlist: z.array(z.string()),
  toolDenylist: z.array(z.string()),
  reasonCodes: z.array(z.string()),
  metadata: z.object({
    policyVersion: z.string(),
    evaluatedAt: z.string().datetime(),
    evaluator: z.string(),
    riskScore: z.number(),
    confidence: z.number(),
  }),
});

export const OrchestrationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  progress: z.number().min(0).max(100),
  createdAt: z.string().datetime(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  estimatedCompletion: z.string().datetime().optional(),
  agentId: z.string(),
  agentName: z.string(),
  executionPlan: ExecutionPlanSchema,
  metrics: z.object({
    duration: z.number().optional(),
    cost: z.number().optional(),
    tokensUsed: z.number().optional(),
    toolCalls: z.number().optional(),
  }),
});

// Agent schemas
export const AgentProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  version: z.string(),
  status: z.enum(['active', 'inactive', 'maintenance', 'error']),
  behaviorPreset: z.string(),
  lastActivity: z.string().datetime(),
  capabilities: z.array(z.string()),
  permissions: z.array(z.string()),
  riskProfile: z.object({
    maxCost: z.number(),
    maxExecutionTime: z.number(),
    allowedTools: z.array(z.string()),
    forbiddenTools: z.array(z.string()),
    autonomyLevel: z.number().min(1).max(5),
  }),
  metrics: z.object({
    tasksCompleted: z.number(),
    successRate: z.number(),
    averageResponseTime: z.number(),
    costThisMonth: z.number(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Policy and Supervisor schemas
export const PolicyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priority: z.number(),
  enabled: z.boolean(),
  action: z.enum(['allow', 'deny', 'ask', 'autofix']),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'contains', 'matches', 'gt', 'lt', 'in', 'not_in']),
    value: z.any(),
  })),
  parameters: z.record(z.any()),
});

export const PolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(['active', 'inactive', 'draft']),
  priority: z.number(),
  version: z.string(),
  rules: z.array(PolicyRuleSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metrics: z.object({
    decisionsMade: z.number(),
    averageDecisionTime: z.number(),
    denialRate: z.number(),
    approvalRate: z.number(),
  }),
});

export const SupervisorDecisionSchema = z.object({
  id: z.string(),
  orchestrationId: z.string(),
  agentId: z.string().optional(),
  intent: z.record(z.any()),
  executionPlan: ExecutionPlanSchema,
  timestamp: z.string().datetime(),
  userId: z.string().optional(),
});

// Memory schemas
export const MemorySchema = z.object({
  id: z.string(),
  type: z.enum(['conversation', 'knowledge', 'policy', 'procedure']),
  content: z.object({
    summary: z.string(),
    keyPoints: z.array(z.string()),
  }),
  importance: z.number().min(0).max(1),
  tags: z.array(z.string()),
  source: z.object({
    type: z.enum(['orchestration', 'agent', 'user', 'supervisor']),
    id: z.string(),
  }),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.object({
    tokens: z.number(),
    embedding: z.array(z.number()).optional(),
  }),
});

// Plugin schemas
export const PluginSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['ai', 'network', 'filesystem', 'code', 'data', 'utility']),
  status: z.enum(['active', 'inactive', 'error', 'loading']),
  version: z.string(),
  capabilities: z.array(z.string()),
  permissions: z.array(z.string()),
  safetyLevel: z.enum(['safe', 'caution', 'restricted']),
  metadata: z.object({
    author: z.string().optional(),
    homepage: z.string().url().optional(),
    repository: z.string().url().optional(),
    license: z.string().optional(),
  }),
  health: z.object({
    status: z.enum(['healthy', 'degraded', 'critical']),
    lastCheck: z.string().datetime(),
    details: z.record(z.string()).optional(),
  }),
});

// Audit schemas
export const AuditEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  type: z.enum([
    'supervisor_decision',
    'agent_action',
    'system_event',
    'policy_violation',
    'user_action',
  ]),
  level: z.enum(['info', 'warning', 'error', 'critical']),
  message: z.string(),
  userId: z.string().optional(),
  agentId: z.string().optional(),
  orchestrationId: z.string().optional(),
  policyId: z.string().optional(),
  metadata: z.record(z.any()),
});

export const ComplianceExportSchema = z.object({
  exportId: z.string(),
  type: z.enum(['orchestration_bundle', 'compliance_report']),
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  format: z.literal('json'),
  data: z.record(z.any()),
  generatedAt: z.string().datetime(),
  schemaVersion: z.string(),
});

// WebSocket event schemas
export const WebSocketEventSchema = z.object({
  type: z.string(),
  data: z.record(z.any()),
  timestamp: z.string().datetime(),
  source: z.string(),
  correlationId: z.string().optional(),
});

export const ToolRequestedEventSchema = z.object({
  event: z.literal('ToolRequested'),
  data: z.object({
    orchestrationId: z.string(),
    agentId: z.string(),
    toolId: z.string(),
    input: z.record(z.any()),
    timestamp: z.string().datetime(),
    correlationId: z.string(),
  }),
});

export const ToolExecutedEventSchema = z.object({
  event: z.literal('ToolExecuted'),
  data: z.object({
    orchestrationId: z.string(),
    agentId: z.string(),
    toolId: z.string(),
    result: z.object({
      success: z.boolean(),
      output: z.any(),
      executionTime: z.number(),
      metadata: z.record(z.any()),
    }),
    timestamp: z.string().datetime(),
    correlationId: z.string(),
  }),
});

export const LLMRequestedEventSchema = z.object({
  event: z.literal('LLMRequested'),
  data: z.object({
    orchestrationId: z.string(),
    agentId: z.string(),
    providerId: z.string(),
    prompt: z.string(),
    parameters: z.record(z.any()),
    timestamp: z.string().datetime(),
    correlationId: z.string(),
  }),
});

export const LLMRespondedEventSchema = z.object({
  event: z.literal('LLMResponded'),
  data: z.object({
    orchestrationId: z.string(),
    agentId: z.string(),
    providerId: z.string(),
    response: z.object({
      text: z.string(),
      tokens: z.number(),
      metadata: z.record(z.any()),
    }),
    timestamp: z.string().datetime(),
    correlationId: z.string(),
  }),
});

// API Response schemas using the base schema
export const OverviewResponseSchema = ApiResponseSchema(OverviewStatsSchema);
export const OrchestrationsResponseSchema = ApiResponseSchema(
  z.object({
    orchestrations: z.array(OrchestrationSchema),
    pagination: PaginationSchema,
  })
);
export const OrchestrationResponseSchema = ApiResponseSchema(OrchestrationSchema);
export const AgentsResponseSchema = ApiResponseSchema(
  z.object({
    agents: z.array(AgentProfileSchema),
    pagination: PaginationSchema,
  })
);
export const AgentResponseSchema = ApiResponseSchema(AgentProfileSchema);
export const PoliciesResponseSchema = ApiResponseSchema(
  z.object({
    policies: z.array(PolicySchema),
    pagination: PaginationSchema,
  })
);
export const PolicyResponseSchema = ApiResponseSchema(PolicySchema);
export const MemoryResponseSchema = ApiResponseSchema(
  z.object({
    memories: z.array(MemorySchema),
    pagination: PaginationSchema,
  })
);
export const PluginsResponseSchema = ApiResponseSchema(
  z.object({
    plugins: z.array(PluginSchema),
    pagination: PaginationSchema,
  })
);
export const AuditResponseSchema = ApiResponseSchema(
  z.object({
    entries: z.array(AuditEntrySchema),
    pagination: PaginationSchema,
  })
);
export const SettingsResponseSchema = ApiResponseSchema(
  z.record(z.any()) // Settings can be any structure
);

// Type exports
export type ApiResponse<T> = z.infer<typeof ApiResponseSchema<T>>;
export type User = z.infer<typeof UserSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
export type OverviewStats = z.infer<typeof OverviewStatsSchema>;
export type Orchestration = z.infer<typeof OrchestrationSchema>;
export type AgentProfile = z.infer<typeof AgentProfileSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type SupervisorDecision = z.infer<typeof SupervisorDecisionSchema>;
export type Memory = z.infer<typeof MemorySchema>;
export type Plugin = z.infer<typeof PluginSchema>;
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export type WebSocketEvent = z.infer<typeof WebSocketEventSchema>;