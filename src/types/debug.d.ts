// Global type declarations for Taberna del Viejo Greg debug system

declare global {
  interface Window {
    __TABERNA_DEBUG?: {
      lastPipeline?: {
        stage: string;
        success: boolean;
        isAborted: boolean;
        retryCount: number;
        initialErrorCount: number;
        repairSteps: number;
        timestamp: number;
      };
      lastContext?: {
        estimatedTokens: number;
        summaryRegenerated: boolean;
        memorySelected: number;
        memoryConsidered: number;
        compressionRan: boolean;
        timestamp: number;
      };
      lastIntentions?: Array<Record<string, unknown>>;
      lastResolutions?: Array<{
        intention: Record<string, unknown>;
        success: boolean;
        resultText: string;
      }>;
      errors: Array<{ message: string; timestamp: number }>;
    };
  }
}

export {};
