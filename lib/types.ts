export interface CpuInfo {
  model: string;
  cores: number;
  threads: number;
  speedMHz: number;
  usage: number;
  load: [number, number, number];
}

export interface MemoryInfo {
  total: number;
  used: number;
  free: number;
  available: number;
  swapTotal: number;
  swapUsed: number;
  percent: number;
}

export interface DiskInfo {
  mount: string;
  label: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface NetworkInterface {
  name: string;
  ip: string;
  mac: string;
  rxBytes: number;
  txBytes: number;
  downloadBps: number;
  uploadBps: number;
  state: string;
}

export interface NetworkInfo {
  downloadBps: number;
  uploadBps: number;
  totalRx: number;
  totalTx: number;
  interfaces: NetworkInterface[];
}

export interface FanInfo {
  name: string;
  rpm: number;
}

export interface TemperatureInfo {
  name: string;
  celsius: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  rss: number;
  /** Extended activity fields, populated by the layout collector. */
  readBps?: number;
  writeBps?: number;
  threads?: number;
  cores?: number[];
  topCore?: number | null;
  sockets?: number;
  cwd?: string;
}

export interface CoreInfo {
  index: number;
  usage: number;
  speedMHz: number;
  topProcess: string | null;
  topProcessPid: number | null;
  topProcessLoad: number;
}

export interface AgentInfo {
  id: string;
  name: string;
  agentType: string;
  state: 'working' | 'done' | 'failed' | 'needs-input' | 'unknown';
  kind: 'chat' | 'terminal' | 'unknown';
  workspace: string;
  repo: string;
  worktreeId: string;
  path: string;
  branch: string;
  title: string;
  prompt: string;
  lastMessage: string;
  toolName: string | null;
  toolInput: string | null;
  activity: string | null;
  outcome: string | null;
  updatedAt: number;
  childCount: number;
}

export interface AgentWorktreeInfo {
  id: string;
  name: string;
  repo: string;
  path: string;
  branch: string;
  status: string;
  isActive: boolean;
  isMain: boolean;
  lastActivityAt: number;
  agents: AgentInfo[];
}

export interface AgentsSnapshot {
  available: boolean;
  source: string;
  error: string | null;
  agents: AgentInfo[];
  worktrees: AgentWorktreeInfo[];
  updatedAt: number;
}

export interface WindowInfo {
  id: string;
  title: string;
  app: string;
  pid: number | null;
  workspace: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

export interface LayoutSnapshot {
  timestamp: number;
  cores: CoreInfo[];
  processes: ProcessInfo[];
  windows: WindowInfo[];
  workspaces: string[];
  currentWorkspace: string | null;
  sources: {
    cpu: string;
    processes: string;
    windows: string;
  };
}

export interface SystemSnapshot {
  timestamp: number;
  hostname: string;
  os: {
    prettyName: string;
    kernel: string;
    arch: string;
    uptimeSeconds: number;
  };
  cpu: CpuInfo;
  memory: MemoryInfo;
  disks: DiskInfo[];
  network: NetworkInfo;
  fans: FanInfo[];
  temperatures: TemperatureInfo[];
  gpu: string;
  board: {
    vendor: string;
    product: string;
    bios: string;
  };
  battery: { capacity: number; status: string } | null;
  processes: ProcessInfo[];
  display: { width: number; height: number; scaleFactor: number };
  appVersion: string;
}

declare global {
  interface Window {
    electronAPI?: {
      getSnapshot: () => Promise<SystemSnapshot>;
      getAgents: () => Promise<AgentsSnapshot>;
      getLayout: () => Promise<LayoutSnapshot>;
      platform: 'linux' | 'win32' | 'darwin';
      getAwakeState: () => Promise<boolean>;
      setAwake: (enabled: boolean) => Promise<boolean>;
      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
    };
  }
}
