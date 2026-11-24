'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Cpu,
  Download,
  Fan,
  Gauge,
  HardDrive,
  Info,
  LayoutDashboard,
  ListChecks,
  MemoryStick,
  Minus,
  Monitor,
  Network,
  RefreshCw,
  ShieldCheck,
  Square,
  Thermometer,
  Upload,
  Wifi,
  Workflow,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import AgentsLayout from './AgentsLayout';
import RingGauge from './RingGauge';
import Sparkline from './Sparkline';
import { formatBytes, formatClock, formatSpeed, formatUptime } from '@/lib/format';
import { createDemoAgents, createDemoLayout } from '@/lib/demo';
import type { AgentsSnapshot, LayoutSnapshot, SystemSnapshot } from '@/lib/types';

const EMPTY_SNAPSHOT: SystemSnapshot = {
  timestamp: 0,
  hostname: '—',
  os: { prettyName: '—', kernel: '—', arch: '—', uptimeSeconds: 0 },
  cpu: { model: '—', cores: 0, threads: 0, speedMHz: 0, usage: 0, load: [0, 0, 0] },
  memory: { total: 0, used: 0, free: 0, available: 0, swapTotal: 0, swapUsed: 0, percent: 0 },
  disks: [],
  network: { downloadBps: 0, uploadBps: 0, totalRx: 0, totalTx: 0, interfaces: [] },
  fans: [],
  temperatures: [],
  gpu: '—',
  board: { vendor: '—', product: '—', bios: '—' },
  battery: null,
  processes: [],
  display: { width: 0, height: 0, scaleFactor: 1 },
  appVersion: '1.0.0',
};

const NAV_ITEMS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'agents', label: 'Agents & Layout', icon: Workflow },
  { id: 'hardware', label: 'Hardware', icon: Cpu },
  { id: 'network', label: 'Network & Downloads', icon: Network },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'sensors', label: 'Thermal & Fans', icon: Thermometer },
  { id: 'processes', label: 'Processes', icon: ListChecks },
];

function createDemoSnapshot(): SystemSnapshot {
  const wobble = (base: number, spread: number) => base + Math.random() * spread;
  return {
    timestamp: Date.now(),
    hostname: 'stellaview-demo',
    os: { prettyName: 'Demo environment', kernel: '6.8.0-generic', arch: 'x64', uptimeSeconds: 45210 },
    cpu: {
      model: 'Demo Processor (sample readings)',
      cores: 8,
      threads: 8,
      speedMHz: 3400,
      usage: wobble(24, 22),
      load: [1.12, 0.94, 0.71],
    },
    memory: {
      total: 16 * 1024 ** 3,
      used: 6.4 * 1024 ** 3,
      free: 2.1 * 1024 ** 3,
      available: 9.6 * 1024 ** 3,
      swapTotal: 2 * 1024 ** 3,
      swapUsed: 96 * 1024 ** 2,
      percent: wobble(38, 6),
    },
    disks: [
      { mount: '/', label: 'System', total: 512 * 1024 ** 3, used: 214 * 1024 ** 3, free: 298 * 1024 ** 3, percent: 42 },
      { mount: '/home', label: 'Home', total: 512 * 1024 ** 3, used: 214 * 1024 ** 3, free: 298 * 1024 ** 3, percent: 42 },
    ],
    network: {
      downloadBps: wobble(1.2, 4) * 1024 ** 2,
      uploadBps: wobble(0.2, 0.8) * 1024 ** 2,
      totalRx: 14.8 * 1024 ** 3,
      totalTx: 3.2 * 1024 ** 3,
      interfaces: [
        {
          name: 'enp3s0',
          ip: '192.168.1.42',
          mac: 'AA:BB:CC:DD:EE:FF',
          rxBytes: 14.8 * 1024 ** 3,
          txBytes: 3.2 * 1024 ** 3,
          downloadBps: wobble(1.2, 4) * 1024 ** 2,
          uploadBps: wobble(0.2, 0.8) * 1024 ** 2,
          state: 'up',
        },
      ],
    },
    fans: [{ name: 'CPU Fan', rpm: Math.round(wobble(1180, 180)) }],
    temperatures: [{ name: 'x86 package', celsius: wobble(48, 9) }],
    gpu: 'Demo Graphics Controller',
    board: { vendor: 'Stellaview', product: 'Demo Machine', bios: '1.0.0' },
    battery: null,
    processes: [
      { pid: 1024, name: 'stellaview', cpu: 4.2, memory: 2.1, rss: 340 * 1024 ** 2 },
      { pid: 733, name: 'gnome-shell', cpu: 2.8, memory: 1.6, rss: 260 * 1024 ** 2 },
      { pid: 88, name: 'systemd', cpu: 0.4, memory: 0.2, rss: 32 * 1024 ** 2 },
    ],
    display: { width: 1920, height: 1080, scaleFactor: 1 },
    appVersion: '1.0.0',
  };
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  spark?: number[];
  color?: string;
}

function StatCard({ icon: Icon, label, value, unit, sub, spark, color = '#81d6ed' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">
          <Icon size={15} strokeWidth={1.8} />
        </span>
      </div>
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-sub">{sub}</div>
      {spark && spark.length > 1 && <Sparkline className="stat-spark" values={spark} color={color} height={42} />}
    </div>
  );
}

function SectionHeading({ id, title, kicker, onRefresh, refreshing }: {
  id: string;
  title: string;
  kicker: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="section-heading" id={id}>
      <div>
        <h2>{title}</h2>
        <div className="section-kicker">{kicker}</div>
      </div>
      {onRefresh && (
        <button className={`refresh-button${refreshing ? ' spinning' : ''}`} onClick={onRefresh}>
          <RefreshCw size={13} />
          Refresh
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<SystemSnapshot>(EMPTY_SNAPSHOT);
  const [agents, setAgents] = useState<AgentsSnapshot>(() => createDemoAgents());
  const [layout, setLayout] = useState<LayoutSnapshot>(() => createDemoLayout());
  const [activityRefreshing, setActivityRefreshing] = useState(false);
  const [history, setHistory] = useState({ cpu: [0, 0], memory: [0, 0], down: [0, 0], up: [0, 0] });
  const [activeNav, setActiveNav] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [isDemo, setIsDemo] = useState(true);
  const [clock, setClock] = useState<Date | null>(null);
  const [platform, setPlatform] = useState<'linux' | 'win32' | 'darwin' | 'browser'>('browser');
  const [keepAwake, setKeepAwake] = useState(false);
  const [awakePending, setAwakePending] = useState(false);

  const refresh = useCallback(async () => {
    let next: SystemSnapshot;
    if (typeof window !== 'undefined' && window.electronAPI) {
      try {
        next = await window.electronAPI.getSnapshot();
        setIsDemo(false);
      } catch {
        next = createDemoSnapshot();
        setIsDemo(true);
      }
    } else {
      next = createDemoSnapshot();
      setIsDemo(true);
    }

    setSnapshot(next);
    setHistory((previous) => ({
      cpu: [...previous.cpu, next.cpu.usage].slice(-40),
      memory: [...previous.memory, next.memory.percent].slice(-40),
      down: [...previous.down, next.network.downloadBps].slice(-40),
      up: [...previous.up, next.network.uploadBps].slice(-40),
    }));
  }, []);

  const refreshActivity = useCallback(async () => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      try {
        const [nextAgents, nextLayout] = await Promise.all([
          window.electronAPI.getAgents(),
          window.electronAPI.getLayout(),
        ]);
        setAgents(nextAgents);
        setLayout(nextLayout);
        return;
      } catch {
        // Fall through to demo data if the desktop bridge is not ready.
      }
    }
    setAgents(createDemoAgents());
    setLayout(createDemoLayout());
  }, []);

  useEffect(() => {
    let mounted = true;
    if (window.electronAPI) {
      setPlatform(window.electronAPI.platform);
      window.electronAPI
        .getAwakeState()
        .then((active) => {
          if (mounted) setKeepAwake(active);
        })
        .catch(() => {
          // Keep the UI responsive if the main process is not ready yet.
        });
    }
    const run = async () => {
      if (!mounted) return;
      setRefreshing(true);
      await refresh();
      if (mounted) setRefreshing(false);
    };
    const runActivity = async () => {
      if (!mounted) return;
      setActivityRefreshing(true);
      await refreshActivity();
      if (mounted) setActivityRefreshing(false);
    };
    void run();
    void runActivity();
    const poll = window.setInterval(() => void run(), 2000);
    const activityPoll = window.setInterval(() => void runActivity(), 5000);
    const tick = window.setInterval(() => setClock(new Date()), 1000);
    return () => {
      mounted = false;
      window.clearInterval(poll);
      window.clearInterval(activityPoll);
      window.clearInterval(tick);
    };
  }, [refresh, refreshActivity]);

  const changeAwake = useCallback(async (enabled: boolean) => {
    if (!window.electronAPI) {
      setKeepAwake(enabled);
      return;
    }
    setAwakePending(true);
    try {
      const active = await window.electronAPI.setAwake(enabled);
      setKeepAwake(active);
    } catch {
      // Leave the previous state in place if the OS call fails.
    } finally {
      setAwakePending(false);
    }
  }, []);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const highestDisk = snapshot.disks.length
    ? Math.max(...snapshot.disks.map((disk) => disk.percent))
    : 0;
  const topFan = snapshot.fans.length ? snapshot.fans[0] : null;

  return (
    <div className={`app-shell platform-${platform}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Stellaview logo" />
          </div>
          <div>
            <div className="brand-name">Stellaview</div>
            <div className="brand-sub">System Intelligence</div>
          </div>
        </div>

        <div className="nav-section-label">Workspace</div>
        <nav>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item${activeNav === id ? ' active' : ''}`}
              onClick={() => {
                setActiveNav(id);
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {keepAwake && (
            <div className="status-line awake-status">
              <span className="live-dot awake" />
              Awake lock active
            </div>
          )}
          <div className="status-line">
            <span className="live-dot" />
            {isDemo ? 'Sample data' : 'Live telemetry'}
          </div>
          <div className="sidebar-note">
            Stellaview {snapshot.appVersion}
            <br />
            Local system access only. No cloud services.
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="titlebar">
          <div className="titlebar-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="titlebar-logo" src="/logo.png" alt="" />
            <div className="titlebar-path">
              Stellaview <span style={{ margin: '0 6px', opacity: 0.4 }}>/</span> <strong>{snapshot.hostname}</strong>
            </div>
          </div>
          <div className="titlebar-right">
            <button
              className={`awake-toggle${keepAwake ? ' active' : ''}`}
              onClick={() => void changeAwake(!keepAwake)}
              disabled={awakePending}
              aria-pressed={keepAwake}
              title={keepAwake ? 'Computer will stay awake until you turn this off' : 'Prevent computer sleep while a task runs'}
            >
              <Zap size={12} />
              <span>Keep awake</span>
              <span className="switch" aria-hidden="true">
                <span className="switch-knob" />
              </span>
            </button>
            <span className="clock">{clock ? formatClock(clock) : '--:--:--'}</span>
            <div className="window-controls">
              <button className="window-btn" aria-label="Minimize" onClick={() => window.electronAPI?.windowControls.minimize()}>
                <Minus size={14} />
              </button>
              <button className="window-btn" aria-label="Maximize" onClick={() => window.electronAPI?.windowControls.maximize()}>
                <Square size={12} />
              </button>
              <button className="window-btn close" aria-label="Close" onClick={() => window.electronAPI?.windowControls.close()}>
                <X size={14} />
              </button>
            </div>
          </div>
        </header>

        <main className="content">
          <div className="hero">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hero-logo" src="/logo.png" alt="" />
            <div className="hero-copy">
              <div className="eyebrow">Stellaview / System Intelligence</div>
              <h1>{greeting}.</h1>
              <p>Everything your machine is doing right now — performance, hardware, network, and sensors — in one calm, focused view.</p>
              <div className="hero-meta">
                <span className="pill"><ShieldCheck size={12} /> <strong>{snapshot.os.prettyName}</strong></span>
                <span className="pill"><Monitor size={12} /> {snapshot.display.width}×{snapshot.display.height}</span>
                <span className="pill"><Clock size={12} /> Up {formatUptime(snapshot.os.uptimeSeconds)}</span>
              </div>
            </div>
          </div>

          {isDemo && (
            <div className="notice">
              <Info size={15} />
              Desktop bridge unavailable — displaying sample readings. Launch Stellaview from its desktop shortcut for live system data.
            </div>
          )}

          {keepAwake && (
            <div className="notice awake-notice">
              <Zap size={15} />
              <span>Keep-awake is active. Your computer will stay on until the task is finished.</span>
              <button className="notice-action" onClick={() => void changeAwake(false)} disabled={awakePending}>
                Mark task finished
              </button>
            </div>
          )}

          <AgentsLayout
            snapshot={snapshot}
            agents={agents}
            layout={layout}
            isDemo={isDemo}
            refreshing={activityRefreshing}
            onRefresh={() => void refreshActivity()}
          />

          <SectionHeading
            id="overview"
            title="Live overview"
            kicker="Updating every 2 seconds"
            onRefresh={() => void refresh()}
            refreshing={refreshing}
          />

          <div className="stat-grid">
            <StatCard
              icon={Cpu}
              label="Processor"
              value={snapshot.cpu.usage.toFixed(0)}
              unit="%"
              sub={`${snapshot.cpu.cores} threads · ${snapshot.cpu.speedMHz} MHz`}
              spark={history.cpu}
            />
            <StatCard
              icon={MemoryStick}
              label="Memory"
              value={snapshot.memory.percent.toFixed(0)}
              unit="%"
              sub={`${formatBytes(snapshot.memory.used)} of ${formatBytes(snapshot.memory.total)}`}
              spark={history.memory}
              color="#8b7cf6"
            />
            <StatCard
              icon={Download}
              label="Download"
              value={formatSpeed(snapshot.network.downloadBps)}
              sub={`Total received ${formatBytes(snapshot.network.totalRx)}`}
              spark={history.down}
              color="#4ade80"
            />
            <StatCard
              icon={Upload}
              label="Upload"
              value={formatSpeed(snapshot.network.uploadBps)}
              sub={`Total sent ${formatBytes(snapshot.network.totalTx)}`}
              spark={history.up}
              color="#8b7cf6"
            />
            <StatCard
              icon={HardDrive}
              label="Storage"
              value={highestDisk.toFixed(0)}
              unit="%"
              sub={`${snapshot.disks.length} mounted volume${snapshot.disks.length === 1 ? '' : 's'}`}
            />
            <StatCard
              icon={Fan}
              label="Fan speed"
              value={topFan ? String(topFan.rpm) : '—'}
              unit={topFan ? 'RPM' : undefined}
              sub={topFan ? topFan.name : 'Not exposed by hardware'}
            />
          </div>

          <div className="panel-grid">
            <section className="panel">
              <div className="panel-header">
                <div className="panel-title"><Activity size={15} /> CPU activity</div>
                <span className="panel-badge">{snapshot.cpu.usage.toFixed(1)}% LOAD</span>
              </div>
              <div className="chart-wrap">
                <Sparkline values={history.cpu} color="#81d6ed" height={188} grid />
              </div>
              <div className="chart-legend">
                <span><i className="legend-dot" style={{ background: '#81d6ed' }} /> Live processor usage</span>
                <span>Load average: {snapshot.cpu.load.join(' / ')}</span>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div className="panel-title"><Gauge size={15} /> Utilization</div>
                <span className="panel-badge">LIVE</span>
              </div>
              <div className="gauge-row">
                <RingGauge value={snapshot.cpu.usage} label="CPU" detail="processor" />
                <RingGauge value={snapshot.memory.percent} color="#8b7cf6" label="Memory" detail={formatBytes(snapshot.memory.used)} />
                <RingGauge value={highestDisk} color="#4ade80" label="Disk" detail={`${snapshot.disks.length} drives`} />
              </div>
              <div style={{ marginTop: 18 }}>
                <div className="disk-row-top">
                  <span className="disk-name">Swap usage</span>
                  <span className="disk-detail">
                    {formatBytes(snapshot.memory.swapUsed)} / {formatBytes(snapshot.memory.swapTotal)}
                  </span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${snapshot.memory.swapTotal ? (snapshot.memory.swapUsed / snapshot.memory.swapTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </section>
          </div>

          <SectionHeading id="hardware" title="Hardware profile" kicker="Detected from your machine" />
          <section className="panel">
            <div className="info-grid">
              <InfoItem label="Processor" value={snapshot.cpu.model} />
              <InfoItem label="Graphics" value={snapshot.gpu} />
              <InfoItem label="Logical threads" value={`${snapshot.cpu.threads} @ ${snapshot.cpu.speedMHz} MHz`} mono />
              <InfoItem label="System board" value={`${snapshot.board.vendor} · ${snapshot.board.product}`} />
              <InfoItem label="Operating system" value={snapshot.os.prettyName} />
              <InfoItem label="Kernel / architecture" value={`${snapshot.os.kernel} · ${snapshot.os.arch}`} mono />
              <InfoItem label="BIOS version" value={snapshot.board.bios} mono />
              <InfoItem label="Hostname" value={snapshot.hostname} mono />
              <InfoItem label="Display" value={`${snapshot.display.width} × ${snapshot.display.height} @ ${snapshot.display.scaleFactor}x`} mono />
              <InfoItem
                label="Battery"
                value={snapshot.battery ? `${snapshot.battery.capacity}% · ${snapshot.battery.status}` : 'No battery detected'}
                mono
              />
            </div>
          </section>

          <SectionHeading id="network" title="Network & downloads" kicker="Live throughput and interface totals" />
          <section className="panel">
            <div className="panel-header">
              <div className="panel-title"><Wifi size={15} /> Network interfaces</div>
              <span className="panel-badge">{snapshot.network.interfaces.length} ACTIVE</span>
            </div>
            {snapshot.network.interfaces.length ? (
              <div>
                {snapshot.network.interfaces.map((iface) => (
                  <div className="interface-row" key={iface.name}>
                    <div>
                      <div className="interface-name">
                        <Wifi size={13} /> {iface.name}
                        <span className="panel-badge" style={{ marginLeft: 4 }}>{iface.state}</span>
                      </div>
                      <div className="interface-detail">{iface.ip} · {iface.mac}</div>
                      <div className="interface-detail">RX {formatBytes(iface.rxBytes)} · TX {formatBytes(iface.txBytes)}</div>
                    </div>
                    <div className="interface-speeds">
                      <div>
                        <div className="speed-label"><ArrowDownRight size={10} /> Down</div>
                        <div className="speed-value accent-text">{formatSpeed(iface.downloadBps)}</div>
                      </div>
                      <div>
                        <div className="speed-label"><ArrowUpRight size={10} /> Up</div>
                        <div className="speed-value">{formatSpeed(iface.uploadBps)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Network} text="No network interfaces are reporting data." />
            )}
          </section>

          <SectionHeading id="storage" title="Storage" kicker="Available space on mounted volumes" />
          <section className="panel">
            {snapshot.disks.length ? (
              <div className="disk-list">
                {snapshot.disks.map((disk) => (
                  <div key={disk.mount}>
                    <div className="disk-row-top">
                      <div>
                        <span className="disk-name">{disk.label}</span>
                        <span className="disk-path">{disk.mount}</span>
                      </div>
                      <span className="disk-detail">
                        {formatBytes(disk.used)} used of {formatBytes(disk.total)} · {disk.percent.toFixed(0)}%
                      </span>
                    </div>
                    <div className="bar-track">
                      <div
                        className={`bar-fill${disk.percent > 85 ? ' warn' : ''}`}
                        style={{ width: `${disk.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={HardDrive} text="No mounted volumes could be read." />
            )}
          </section>

          <SectionHeading id="sensors" title="Thermal & fans" kicker="Hardware sensors, when your machine exposes them" />
          <div className="two-col">
            <section className="panel">
              <div className="panel-header">
                <div className="panel-title"><Thermometer size={15} /> Temperatures</div>
                <span className="panel-badge">{snapshot.temperatures.length} SENSORS</span>
              </div>
              {snapshot.temperatures.length ? (
                <div className="sensor-list">
                  {snapshot.temperatures.map((temp) => (
                    <div className="sensor-row" key={temp.name}>
                      <div className="sensor-row-top">
                        <span className="sensor-name">{temp.name}</span>
                        <span className="sensor-value">{temp.celsius.toFixed(1)} °C</span>
                      </div>
                      <div className="bar-track">
                        <div
                          className={`bar-fill${temp.celsius > 80 ? ' warn' : ''}`}
                          style={{ width: `${Math.min(100, Math.max(0, temp.celsius))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Thermometer} text="No temperature sensors are available on this system." />
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <div className="panel-title"><Fan size={15} /> Fan speeds</div>
                <span className="panel-badge">{snapshot.fans.length} FANS</span>
              </div>
              {snapshot.fans.length ? (
                <div className="sensor-list">
                  {snapshot.fans.map((fan) => (
                    <div className="sensor-row" key={fan.name}>
                      <div className="sensor-row-top" style={{ marginBottom: 0 }}>
                        <span className="sensor-name">{fan.name}</span>
                        <span className="sensor-value">{fan.rpm.toLocaleString()} RPM</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Fan}
                  text="Fan speeds are not exposed by this machine's hardware. Many Mini PCs and laptops do not publish RPM readings."
                />
              )}
            </section>
          </div>

          <SectionHeading id="processes" title="Top processes" kicker="Highest CPU consumers right now" />
          <section className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Process</th>
                    <th className="num">PID</th>
                    <th className="num">CPU %</th>
                    <th className="num">Memory %</th>
                    <th className="num">RSS</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.processes.map((process) => (
                    <tr key={process.pid}>
                      <td className="process-name">{process.name}</td>
                      <td className="num mono">{process.pid}</td>
                      <td className="num mono">{process.cpu.toFixed(1)}</td>
                      <td className="num mono">{process.memory.toFixed(1)}</td>
                      <td className="num mono">{formatBytes(process.rss)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!snapshot.processes.length && <EmptyState icon={ListChecks} text="No process data available." />}
            </div>
          </section>

          <footer className="footer">
            <div className="footer-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" />
              Stellaview — your system, at a glance.
            </div>
            <span>Local-only telemetry · v{snapshot.appVersion}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="info-item">
      <div className="info-label">{label}</div>
      <div className={`info-value${mono ? ' mono' : ''}`}>{value}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="empty-state">
      <Icon size={22} strokeWidth={1.5} />
      <span>{text}</span>
    </div>
  );
}
