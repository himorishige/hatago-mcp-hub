import type { HatagoConfig } from '@himorishige/hatago-core/schemas';
import type { HatagoHub } from '@himorishige/hatago-hub/node';

export type HubTestOptions = {
  config?: Partial<HatagoConfig>;
  timeout?: number;
  verbose?: boolean;
};

export type FixtureOptions = {
  type: 'stdio' | 'http' | 'sse';
  port?: number;
  features?: {
    echo?: boolean;
    stream?: boolean;
    slow?: boolean;
    fail?: boolean;
    resources?: boolean;
  };
};

export type WaitForOptions = {
  timeout?: number;
  interval?: number;
  errorMessage?: string;
};

export type TestFixture = {
  type: 'stdio' | 'http' | 'sse';
  port?: number;
  command?: string;
  args?: string[];
  url?: string;
  cleanup: () => Promise<void>;
};

export type TestContext = {
  hub: HatagoHub;
  fixture: TestFixture;
};
