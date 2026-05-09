export interface Manifest {
  projects: string[];
  lastUpdated: string;
}

export interface BrowserStat {
  id: string;
  name: string;
  icon: string;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  total: number;
}

export interface Attachment {
  name: string;
  contentType: string;
}

export interface TestFailure {
  test: string;
  file: string;
  line: number;
  error: string;
  browser: string;
  steps: string[];
  failedStepIdx: number;
  attachments: Attachment[];
}

export interface FlakyTest {
  test: string;
  file: string;
  line: number;
  retries: number;
}

export interface SlowTest {
  test: string;
  file: string;
  durationMs: number;
}

export interface TestResult {
  project: string;
  date: string;
  status: 'passed' | 'failed';
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  duration: string;
  browsers: BrowserStat[];
  failures: TestFailure[];
  flakyTests: FlakyTest[];
  slowTests: SlowTest[];
}
