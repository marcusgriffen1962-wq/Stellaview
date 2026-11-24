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
      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
    };
  }
}
