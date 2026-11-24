'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AppWindow,
  Bot,
  CircleDot,
  Clock,
  Cpu,
  Eye,
  EyeOff,
  Gauge,
  GitBranch,
  HardDrive,
  Info,
  Layers,
  Map,
  Monitor,
  Network,
  Search,
  Server,
  Terminal,
  Workflow,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { formatBytes, formatSpeed } from '@/lib/format';
import type {
  AgentInfo,
  AgentsSnapshot,
  LayoutSnapshot,
  ProcessInfo,
  SystemSnapshot,
  WindowInfo,
} from '@/lib/types';

interface AgentsLayoutProps {
  snapshot: SystemSnapshot;
  agents: AgentsSnapshot;
  layout: LayoutSnapshot;
  isDemo: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

const STATE_LABELS: Record<AgentInfo['state'], string> = {
  working: 'Working',
  done: 'Done',
  failed: 'Failed',
  'needs-input': 'Needs you',
  unknown: 'Idle',
};

function relativeTime(timestamp: number) {
  if (!timestamp) return 'unknown';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function shortPath(value: string) {
  if (!value) return '—';
  return value.replace(/^\/home\/[^/]+/, '~');
}

function compact(value: string, max = 46) {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isAgentProcess(agent: AgentInfo, process: ProcessInfo) {
  if (!agent.path || !process.cwd) return false;
  const root = agent.path.replace(/\/+$/, '');
  const cwd = process.cwd.replace(/\/+$/, '');
  if (root.length < 8) return false;
  return cwd === root || cwd.startsWith(`${root}/`);
}

function relatedProcesses(agent: AgentInfo, processes: ProcessInfo[]) {
  return processes.filter((process) => isAgentProcess(agent, process));
}

function relatedWindows(agent: AgentInfo, windows: WindowInfo[], processes: ProcessInfo[]) {
  const pids = new Set(relatedProcesses(agent, processes).map((process) => process.pid));
  const hints = [agent.workspace, agent.repo, ...agent.name.split(/\s+/)]
    .filter((hint) => hint && hint.length > 3)
    .map((hint) => hint.toLowerCase());
  return windows.filter((window) => {
    if (window.pid && pids.has(window.pid)) return true;
    const title = window.title.toLowerCase();
    return hints.some((hint) => title.includes(hint));
  });
}

function SubHeading({ title, kicker, badge }: { title: string; kicker: string; badge?: string }) {
  return (
    <div className="section-heading sub-heading">
      <div>
        <h2>{title}</h2>
        <div className="section-kicker">{kicker}</div>
      </div>
      {badge && <span className="panel-badge">{badge}</span>}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="summary-tile">
      <div className="summary-icon">
        <Icon size={16} strokeWidth={1.8} />
      </div>
      <div>
        <div className="summary-label">{label}</div>
        <div className="summary-value">{value}</div>
        <div className="summary-sub">{sub}</div>
      </div>
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

export default function AgentsLayout({
  snapshot,
  agents,
  layout,
  isDemo,
  refreshing,
  onRefresh,
}: AgentsLayoutProps) {
  const [query, setQuery] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const selectedAgent = agents.agents.find((agent) => agent.id === selectedAgentId) || null;
  const highlightedProcesses = useMemo(
    () => (selectedAgent ? relatedProcesses(selectedAgent, layout.processes) : []),
    [selectedAgent, layout.processes]
  );
  const highlightedPids = useMemo(
    () => new Set(highlightedProcesses.map((process) => process.pid)),
    [highlightedProcesses]
  );
  const highlightedCores = useMemo(
    () => new Set(highlightedProcesses.flatMap((process) => process.cores || [])),
    [highlightedProcesses]
  );
  const highlightedWindows = useMemo(
    () =>
      selectedAgent
        ? new Set(relatedWindows(selectedAgent, layout.windows, layout.processes).map((window) => window.id))
        : new Set<string>(),
    [selectedAgent, layout.windows, layout.processes]
  );

  const activeAgents = agents.agents.filter((agent) => agent.state === 'working').length;
  const activeWorktrees = agents.worktrees.filter((worktree) => worktree.isActive).length;
  const visibleWindows = layout.windows.filter((window) => window.visible).length;
  const busyCores = layout.cores.filter((core) => core.usage >= 10).length;
  const topMemoryProcess = [...layout.processes].sort((a, b) => b.rss - a.rss)[0] || null;
  const topIoProcess = [...layout.processes].sort(
    (a, b) =>
      (b.readBps || 0) + (b.writeBps || 0) - ((a.readBps || 0) + (a.writeBps || 0))
  )[0] || null;
  const topSocketProcess = [...layout.processes].sort(
    (a, b) => (b.sockets || 0) - (a.sockets || 0)
  )[0] || null;
  const topCpuProcess = [...layout.processes].sort((a, b) => b.cpu - a.cpu)[0] || null;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProcesses = layout.processes.filter((process) =>
    [process.name, String(process.pid), process.cwd || '', ...(process.cores || []).map(String)]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery)
  );

  const displayWidth = snapshot.display.width || 1920;
  const displayHeight = snapshot.display.height || 1080;
  const hasWindowGeometry = layout.windows.some((window) => window.width > 0 && window.height > 0);

  return (
    <>
      <div className="section-heading" id="agents">
        <div>
          <h2>Agents &amp; layout</h2>
          <div className="section-kicker">
            Orca sessions, processes, windows and hardware — mapped together, refreshed every 5 seconds
          </div>
        </div>
        <button
          className={`refresh-button${refreshing ? ' spinning' : ''}`}
          onClick={onRefresh}
        >
          <RefreshIcon />
          Refresh
        </button>
      </div>

      {!agents.available && (
        <div className="notice subtle-notice">
          <Info size={15} />
          <span>
            {isDemo
              ? 'Browser preview: showing sample agents and layout. Open the desktop app for live Orca state.'
              : `Orca CLI is not responding — showing the last known agent state. ${agents.error || ''}`}
          </span>
        </div>
      )}

      <div className="summary-strip">
        <SummaryTile
          icon={Bot}
          label="Orca agents"
          value={`${activeAgents} / ${agents.agents.length}`}
          sub={activeAgents ? 'currently working' : 'none working right now'}
        />
        <SummaryTile
          icon={GitBranch}
          label="Workspaces"
          value={`${activeWorktrees} / ${agents.worktrees.length}`}
          sub="worktrees with activity"
        />
        <SummaryTile
          icon={AppWindow}
          label="Windows"
          value={String(visibleWindows)}
          sub={`${layout.workspaces.length} workspace${layout.workspaces.length === 1 ? '' : 's'}`}
        />
        <SummaryTile
          icon={Cpu}
          label="Busy cores"
          value={`${busyCores} / ${layout.cores.length}`}
          sub={topCpuProcess ? `led by ${compact(topCpuProcess.name, 22)}` : 'idle'}
        />
      </div>

      <div className="agents-grid">
        <section className="panel">
          <div className="panel-header">
            <div className="panel-title"><Bot size={15} /> Agent sessions</div>
            <span className="panel-badge">{agents.agents.length} TOTAL</span>
          </div>
          {agents.agents.length ? (
            <div className="agent-list">
              {agents.agents.map((agent) => {
                const processes = relatedProcesses(agent, layout.processes);
                const windows = relatedWindows(agent, layout.windows, layout.processes);
                return (
                  <button
                    key={agent.id}
                    className={`agent-card state-${agent.state}${selectedAgentId === agent.id ? ' selected' : ''}`}
                    onClick={() => setSelectedAgentId(selectedAgentId === agent.id ? null : agent.id)}
                    type="button"
                  >
                    <div className="agent-card-head">
                      <span className={`agent-avatar state-${agent.state}`}>
                        <Bot size={15} />
                      </span>
                      <div className="agent-card-title">
                        <strong>{agent.name}</strong>
                        <span>
                          {agent.agentType} · {agent.workspace}
                          {agent.branch ? ` · ${agent.branch}` : ''}
                        </span>
                      </div>
                      <span className={`state-badge state-${agent.state}`}>
                        {STATE_LABELS[agent.state]}
                      </span>
                    </div>

                    {agent.prompt && <div className="agent-prompt">“{compact(agent.prompt, 150)}”</div>}

                    {(agent.toolName || agent.lastMessage) && (
                      <div className="agent-action">
                        <Terminal size={12} />
                        <span>
                          {agent.toolName
                            ? `${agent.toolName}${agent.toolInput ? ` · ${compact(agent.toolInput, 96)}` : ''}`
                            : compact(agent.lastMessage, 130)}
                        </span>
                      </div>
                    )}

                    {agent.toolName && agent.lastMessage && (
                      <div className="agent-message">{compact(agent.lastMessage, 180)}</div>
                    )}

                    <div className="agent-card-foot">
                      <span><GitBranch size={11} /> {agent.branch || 'no branch'}</span>
                      <span><Clock size={11} /> {relativeTime(agent.updatedAt)}</span>
                      {agent.childCount > 0 && <span><Workflow size={11} /> {agent.childCount} children</span>}
                    </div>

                    <div className="agent-relations">
                      {processes.length ? (
                        <span className="relation-chip">
                          <Server size={11} />
                          {processes.slice(0, 3).map((process) => process.name).join(', ')}
                        </span>
                      ) : null}
                      {windows.length ? (
                        <span className="relation-chip">
                          <AppWindow size={11} />
                          {windows.slice(0, 2).map((window) => compact(window.app, 18)).join(', ')}
                        </span>
                      ) : null}
                      {!processes.length && !windows.length && (
                        <span className="relation-chip muted">No direct process match</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={Bot} text="No Orca sessions were found." />
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div className="panel-title"><GitBranch size={15} /> Worktrees</div>
            <span className="panel-badge">{agents.worktrees.length} WORKSPACES</span>
          </div>
          {agents.worktrees.length ? (
            <div className="worktree-list">
              {agents.worktrees.map((worktree) => (
                <div
                  key={worktree.id}
                  className={`worktree-card${worktree.isActive ? ' active' : ''}`}
                >
                  <div className="worktree-head">
                    <CircleDot size={13} />
                    <strong>{worktree.name}</strong>
                    <span className={`state-badge state-${worktree.status === 'working' ? 'working' : 'done'}`}>
                      {worktree.status}
                    </span>
                  </div>
                  <div className="worktree-path mono">
                    {shortPath(worktree.path)}
                    {worktree.branch ? ` · ${worktree.branch}` : ''}
                  </div>
                  <div className="worktree-sessions">
                    {worktree.agents.length ? (
                      worktree.agents.map((agent) => (
                        <button
                          key={`${worktree.id}-${agent.id}`}
                          className={`worktree-session${selectedAgentId === agent.id ? ' selected' : ''}`}
                          onClick={() => setSelectedAgentId(agent.id)}
                          type="button"
                        >
                          <span className={`state-dot state-${agent.state}`} />
                          <span>{compact(agent.name, 34)}</span>
                          <small>{STATE_LABELS[agent.state]}</small>
                        </button>
                      ))
                    ) : (
                      <span className="muted tiny">No sessions in this worktree</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={GitBranch} text="No Orca worktrees were found." />
          )}
        </section>
      </div>

      <SubHeading
        title="Hardware topology"
        kicker="Where the current workload is landing"
        badge="LIVE MAP"
      />
      <section className="panel topology-panel">
        <div className="topology-flow">
          <div className="topology-node">
            <div className="topology-icon"><Cpu size={18} /></div>
            <div className="topology-body">
              <div className="topology-label">Processor</div>
              <div className="topology-value">{snapshot.cpu.usage.toFixed(0)}%</div>
              <div className="topology-detail mono">{compact(snapshot.cpu.model, 42)}</div>
              <div className="topology-detail">
                {busyCores} busy / {layout.cores.length || snapshot.cpu.cores} cores
                {topCpuProcess ? ` · ${compact(topCpuProcess.name, 20)}` : ''}
              </div>
            </div>
          </div>
          <div className="topology-link" />
          <div className="topology-node">
            <div className="topology-icon purple"><Layers size={18} /></div>
            <div className="topology-body">
              <div className="topology-label">Memory</div>
              <div className="topology-value">{snapshot.memory.percent.toFixed(0)}%</div>
              <div className="topology-detail">
                {formatBytes(snapshot.memory.used)} / {formatBytes(snapshot.memory.total)}
              </div>
              <div className="topology-detail">
                {topMemoryProcess
                  ? `largest: ${compact(topMemoryProcess.name, 20)} · ${formatBytes(topMemoryProcess.rss)}`
                  : 'no process data'}
              </div>
            </div>
          </div>
          <div className="topology-link" />
          <div className="topology-node">
            <div className="topology-icon green"><HardDrive size={18} /></div>
            <div className="topology-body">
              <div className="topology-label">Storage</div>
              <div className="topology-value">{snapshot.disks.length}</div>
              <div className="topology-detail">mounted volumes</div>
              <div className="topology-detail">
                {topIoProcess
                  ? `busiest: ${compact(topIoProcess.name, 20)} · ${formatSpeed((topIoProcess.readBps || 0) + (topIoProcess.writeBps || 0))}`
                  : 'no I/O data'}
              </div>
            </div>
          </div>
          <div className="topology-link" />
          <div className="topology-node">
            <div className="topology-icon cyan"><Wifi size={18} /></div>
            <div className="topology-body">
              <div className="topology-label">Network</div>
              <div className="topology-value accent-text">{formatSpeed(snapshot.network.downloadBps)}</div>
              <div className="topology-detail">down · {formatSpeed(snapshot.network.uploadBps)} up</div>
              <div className="topology-detail">
                {topSocketProcess
                  ? `most sockets: ${compact(topSocketProcess.name, 20)} · ${topSocketProcess.sockets ?? 0}`
                  : `${snapshot.network.interfaces.length} interfaces`}
              </div>
            </div>
          </div>
        </div>
        <div className="topology-secondary">
          <div><Monitor size={13} /> Display {snapshot.display.width}×{snapshot.display.height}</div>
          <div><Gauge size={13} /> {compact(snapshot.gpu, 48)}</div>
          <div><Layers size={13} /> {compact(`${snapshot.board.vendor} ${snapshot.board.product}`, 40)}</div>
          <div><Activity size={13} /> Load {snapshot.cpu.load.join(' / ')}</div>
        </div>
        <div className="source-line mono">
          CPU {layout.sources.cpu} · Processes {layout.sources.processes}
        </div>
      </section>

      <SubHeading
        title="Per-core CPU map"
        kicker="Threads mapped to logical processors"
        badge={`${layout.cores.length} CORES`}
      />
      <section className="panel">
        {layout.cores.length ? (
          <div className="core-grid">
            {layout.cores.map((core) => (
              <div
                key={core.index}
                className={`core-cell${core.usage >= 70 ? ' hot' : ''}${highlightedCores.has(core.index) ? ' highlight' : ''}`}
              >
                <div className="core-cell-top">
                  <span className="core-index">C{core.index}</span>
                  <strong>{core.usage.toFixed(0)}%</strong>
                </div>
                <div className="bar-track thin">
                  <div className="bar-fill" style={{ width: `${clamp(core.usage, 0, 100)}%` }} />
                </div>
                <div className="core-process" title={core.topProcess || 'idle'}>
                  {compact(core.topProcess || 'idle', 18)}
                </div>
                <div className="core-load mono">
                  {core.topProcessLoad ? `${core.topProcessLoad.toFixed(1)}% thread load` : `${core.speedMHz} MHz`}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Cpu} text="Per-core thread data is only available on Linux." />
        )}
      </section>

      <SubHeading
        title="Workspace & window map"
        kicker="Open windows positioned against your display"
        badge={layout.sources.windows}
      />
      <div className="workspace-grid">
        <section className="panel map-panel">
          <div className="panel-header">
            <div className="panel-title"><Map size={15} /> Display {displayWidth}×{displayHeight}</div>
            <span className="panel-badge">{layout.windows.length} WINDOWS</span>
          </div>
          {hasWindowGeometry ? (
            <div className="workspace-map">
              <div className="workspace-map-grid" />
              {layout.windows.map((window) => (
                <div
                  key={window.id}
                  className={`window-rect${window.visible ? '' : ' hidden'}${highlightedWindows.has(window.id) ? ' highlight' : ''}${selectedAgent && highlightedPids.has(window.pid || -1) ? ' agent-match' : ''}`}
                  style={{
                    left: `${clamp((window.x / displayWidth) * 100, 0, 98)}%`,
                    top: `${clamp((window.y / displayHeight) * 100, 0, 98)}%`,
                    width: `${clamp((window.width / displayWidth) * 100, 2, 100)}%`,
                    height: `${clamp((window.height / displayHeight) * 100, 2, 100)}%`,
                  }}
                  title={`${window.title} · ${window.app}`}
                >
                  <span>{compact(window.app, 16)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Map} text="Window geometry is not exposed on this platform." />
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div className="panel-title"><AppWindow size={15} /> Window list</div>
          </div>
          {layout.windows.length ? (
            <div className="window-list">
              {layout.workspaces.map((workspace) => {
                const windows = layout.windows.filter((window) => window.workspace === workspace);
                if (!windows.length) return null;
                return (
                  <div key={workspace} className="workspace-group">
                    <div className="workspace-name">
                      {workspace === layout.currentWorkspace ? <Eye size={12} /> : <EyeOff size={12} />}
                      {workspace}
                      {workspace === layout.currentWorkspace ? ' · current' : ''}
                    </div>
                    {windows.map((window) => (
                      <div
                        key={window.id}
                        className={`window-row${highlightedWindows.has(window.id) ? ' highlight' : ''}`}
                      >
                        <div>
                          <div className="window-title">{compact(window.title, 52)}</div>
                          <div className="window-detail mono">
                            {window.app}
                            {window.pid ? ` · PID ${window.pid}` : ''}
                          </div>
                        </div>
                        {window.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={AppWindow} text="No visible windows were detected." />
          )}
        </section>
      </div>

      <SubHeading
        title="Disk & network activity"
        kicker="Volumes, interfaces and the processes using them"
      />
      <div className="two-col">
        <section className="panel">
          <div className="panel-header">
            <div className="panel-title"><HardDrive size={15} /> Volumes</div>
            <span className="panel-badge">{snapshot.disks.length} MOUNTS</span>
          </div>
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
                      {formatBytes(disk.used)} / {formatBytes(disk.total)} · {disk.percent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${disk.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={HardDrive} text="No volumes detected." />
          )}
          <div className="mini-table-title">Process I/O</div>
          <table className="compact-table">
            <thead>
              <tr>
                <th>Process</th>
                <th className="num">Read</th>
                <th className="num">Write</th>
                <th className="num">Cores</th>
              </tr>
            </thead>
            <tbody>
              {[...layout.processes]
                .sort(
                  (a, b) =>
                    (b.readBps || 0) + (b.writeBps || 0) - ((a.readBps || 0) + (a.writeBps || 0))
                )
                .slice(0, 6)
                .map((process) => (
                  <tr key={`io-${process.pid}`} className={highlightedPids.has(process.pid) ? 'highlight-row' : ''}>
                    <td className="process-name">{compact(process.name, 22)}</td>
                    <td className="num mono">{formatSpeed(process.readBps || 0)}</td>
                    <td className="num mono">{formatSpeed(process.writeBps || 0)}</td>
                    <td className="num mono">
                      {process.cores?.length ? process.cores.slice(0, 4).join(',') : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div className="panel-title"><Wifi size={15} /> Interfaces</div>
            <span className="panel-badge">{snapshot.network.interfaces.length} ACTIVE</span>
          </div>
          {snapshot.network.interfaces.length ? (
            <div className="interface-list">
              {snapshot.network.interfaces.map((iface) => (
                <div key={iface.name} className="interface-row compact">
                  <div>
                    <div className="interface-name">
                      <Wifi size={13} /> {iface.name}
                      <span className="panel-badge">{iface.state}</span>
                    </div>
                    <div className="interface-detail mono">{iface.ip} · {iface.mac}</div>
                  </div>
                  <div className="interface-speeds">
                    <div>
                      <div className="speed-label">Down</div>
                      <div className="speed-value accent-text">{formatSpeed(iface.downloadBps)}</div>
                    </div>
                    <div>
                      <div className="speed-label">Up</div>
                      <div className="speed-value">{formatSpeed(iface.uploadBps)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Network} text="No network interfaces detected." />
          )}
          <div className="mini-table-title">Socket owners</div>
          <table className="compact-table">
            <thead>
              <tr>
                <th>Process</th>
                <th className="num">Sockets</th>
                <th className="num">Cores</th>
                <th className="num">Threads</th>
              </tr>
            </thead>
            <tbody>
              {[...layout.processes]
                .sort((a, b) => (b.sockets || 0) - (a.sockets || 0))
                .slice(0, 6)
                .map((process) => (
                  <tr key={`sock-${process.pid}`} className={highlightedPids.has(process.pid) ? 'highlight-row' : ''}>
                    <td className="process-name">{compact(process.name, 22)}</td>
                    <td className="num mono">{process.sockets ?? '—'}</td>
                    <td className="num mono">{process.cores?.length || '—'}</td>
                    <td className="num mono">{process.threads ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      </div>

      <SubHeading
        title="All active processes"
        kicker="CPU, cores, I/O and workspace path for the busiest processes"
        badge={`${layout.processes.length} TRACKED`}
      />
      <section className="panel">
        <div className="process-filter">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by process, PID, core or workspace path…"
            aria-label="Filter processes"
          />
          {query && (
            <button onClick={() => setQuery('')} type="button" aria-label="Clear filter">×</button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Process</th>
                <th className="num">PID</th>
                <th className="num">CPU %</th>
                <th className="num">Cores</th>
                <th className="num">Threads</th>
                <th className="num">Read</th>
                <th className="num">Write</th>
                <th className="num">Sockets</th>
                <th>Workspace</th>
              </tr>
            </thead>
            <tbody>
              {filteredProcesses.map((process) => (
                <tr
                  key={process.pid}
                  className={highlightedPids.has(process.pid) ? 'highlight-row' : ''}
                >
                  <td className="process-name">{process.name}</td>
                  <td className="num mono">{process.pid}</td>
                  <td className="num mono">{process.cpu.toFixed(1)}</td>
                  <td className="num mono">{process.cores?.slice(0, 5).join(', ') || '—'}</td>
                  <td className="num mono">{process.threads ?? '—'}</td>
                  <td className="num mono">{formatSpeed(process.readBps || 0)}</td>
                  <td className="num mono">{formatSpeed(process.writeBps || 0)}</td>
                  <td className="num mono">{process.sockets ?? '—'}</td>
                  <td className="mono path-cell" title={process.cwd}>
                    {compact(shortPath(process.cwd || '—'), 26)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredProcesses.length && (
            <EmptyState icon={Server} text="No processes match this filter." />
          )}
        </div>
      </section>
    </>
  );
}

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}
