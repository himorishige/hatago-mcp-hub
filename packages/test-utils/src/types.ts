import type { HatagoConfig } from '@himorishige/hatago-core/schemas';
import type { HatagoHub } from '@himorishige/hatago-hub';

export interface HubTestOptions {
  config?: Partial<HatagoConfig>;
  timeout?: number;
  verbose?: boolean;
}

export interface FixtureOptions {
  type: 'stdio' | 'http' | 'sse';
  port?: number;
  features?: {
    echo?: boolean;
    stream?: boolean;
    slow?: boolean;
    fail?: boolean;
    resources?: boolean;
  };
}

export interface WaitForOptions {
  timeout?: number;
  interval?: number;
  errorMessage?: string;
}

export interface TestFixture {
  type: 'stdio' | 'http' | 'sse';
  port?: number;
  command?: string;
  args?: string[];
  url?: string;
  cleanup: () => Promise<void>;
}

export interface TestContext {
  hub: HatagoHub;
  fixture: TestFixture;
}
