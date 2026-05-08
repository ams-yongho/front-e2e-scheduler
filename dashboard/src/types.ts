export interface Manifest {
  projects: string[];
  lastUpdated: string;
}

export interface TestFailure {
  test: string;
  file: string;
  line: number;
  error: string;
}

export interface TestResult {
  project: string;
  date: string;
  status: 'passed' | 'failed';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
  failures: TestFailure[];
}
