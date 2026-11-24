'use strict';

const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

let previousCores = null;
let previousIo = new Map();
let previousIoTime = 0;

function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeExec(command, args, timeout = 1200) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function parseCsvLine(line) {
  const quoted = line.match(/"([^"]*)"/g);
  if (quoted && quoted.length) return quoted.map((value) => value.slice(1, -1));
  return line.split(',').map((value) => value.trim());
}

function cpuTimes(cpu) {
  const times = cpu.times || {};
  const idle = times.idle || 0;
  const total =
    (times.user || 0) +
    (times.nice || 0) +
    (times.sys || 0) +
    idle +
    (times.irq || 0);
  return { idle, total };
}

function getCoreBase() {
  const cpus = os.cpus();
  const values = cpus.map(cpuTimes);
  const now = Date.now();
  const cores = cpus.map((cpu, index) => {
    const current = values[index];
    const previous = previousCores && previousCores.values[index];
    let usage = 0;
    if (previous && current.total > previous.total) {
      usage = clamp((1 - (current.idle - previous.idle) / (current.total - previous.total)) * 100, 0, 100);
    }
    return {
      index,
      usage,
      speedMHz: cpu.speed || 0,
      topProcess: null,
      topProcessPid: null,
      topProcessLoad: 0,
    };
  });
  previousCores = { time: now, values };
  return cores;
}

function emptyThreadData() {
  return {
    pidNames: new Map(),
    threadCount: new Map(),
    pidCores: new Map(),
    coreLoad: new Map(),
    pidCpu: new Map(),
  };
}

function readLinuxThreads() {
  const output = safeExec('ps', ['-eLo', 'pid,psr,pcpu,comm', '--no-headers'], 1500);
  if (!output) return emptyThreadData();

  const data = emptyThreadData();
  for (const line of output.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const pid = Number(parts[0]);
    const core = Number(parts[1]);
    const cpu = Number(parts[2]);
    const name = parts.slice(3).join(' ');
    if (!Number.isFinite(pid) || !Number.isFinite(core) || !Number.isFinite(cpu)) continue;

    // The first row for a PID is the main thread and has the useful process name.
    if (!data.pidNames.has(pid)) data.pidNames.set(pid, name);
    data.threadCount.set(pid, (data.threadCount.get(pid) || 0) + 1);
    data.pidCpu.set(pid, (data.pidCpu.get(pid) || 0) + cpu);

    if (!data.pidCores.has(pid)) data.pidCores.set(pid, new Map());
    const perCore = data.pidCores.get(pid);
    perCore.set(core, (perCore.get(core) || 0) + cpu);

    data.coreLoad.set(core, (data.coreLoad.get(core) || 0) + cpu);
  }
  return data;
}

function readProcessIo(pid) {
  const raw = readFile(`/proc/${pid}/io`);
  const read = raw.match(/^read_bytes:\s+(\d+)/m);
  const write = raw.match(/^write_bytes:\s+(\d+)/m);
  return {
    readBytes: read ? Number(read[1]) : 0,
    writeBytes: write ? Number(write[1]) : 0,
  };
}

function readProcessRss(pid) {
  const raw = readFile(`/proc/${pid}/status`);
  const match = raw.match(/^VmRSS:\s+(\d+)\s+kB/m);
  return match ? Number(match[1]) * 1024 : 0;
}

function readProcessCwd(pid) {
  try {
    return fs.realpathSync(`/proc/${pid}/cwd`);
  } catch {
    return '';
  }
}

function readSocketCount(pid) {
  try {
    const fds = fs.readdirSync(`/proc/${pid}/fd`);
    let count = 0;
    for (const fd of fds) {
      try {
        if (fs.readlinkSync(`/proc/${pid}/fd/${fd}`).startsWith('socket:[')) count += 1;
      } catch {
        // Descriptor disappeared while reading.
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function getLinuxProcesses(threadData) {
  const pids = Array.from(threadData.pidCpu.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([pid]) => pid);
  const now = Date.now();
  const elapsed = previousIoTime ? Math.max((now - previousIoTime) / 1000, 0.001) : 0;
  const nextIo = new Map();

  const processes = pids.map((pid) => {
    const io = readProcessIo(pid);
    nextIo.set(pid, { ...io, time: now });
    const previous = previousIo.get(pid);
    const readBps = previous && elapsed ? Math.max(0, (io.readBytes - previous.readBytes) / elapsed) : 0;
    const writeBps = previous && elapsed ? Math.max(0, (io.writeBytes - previous.writeBytes) / elapsed) : 0;
    const perCore = threadData.pidCores.get(pid) || new Map();
    const cores = Array.from(perCore.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([core]) => core);

    return {
      pid,
      name: threadData.pidNames.get(pid) || String(pid),
      cpu: threadData.pidCpu.get(pid) || 0,
      memory: 0,
      rss: readProcessRss(pid),
      readBps,
      writeBps,
      threads: threadData.threadCount.get(pid) || 1,
      cores,
      topCore: cores.length ? cores[0] : null,
      sockets: readSocketCount(pid),
      cwd: readProcessCwd(pid),
    };
  });

  previousIo = nextIo;
  previousIoTime = now;
  return processes.sort((a, b) => b.cpu - a.cpu);
}

function getFallbackProcesses() {
  if (process.platform === 'darwin') {
    const output = safeExec('ps', ['-eo', 'pid,comm,pcpu,pmem,rss', '-r'], 1500);
    return output
      .split('\n')
      .filter((line) => line.trim() && !/^\s*PID\s/.test(line))
      .slice(0, 18)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) return null;
        const pid = Number(parts[0]);
        if (!Number.isFinite(pid)) return null;
        return {
          pid,
          name: parts[1],
          cpu: Number(parts[2]) || 0,
          memory: Number(parts[3]) || 0,
          rss: (Number(parts[4]) || 0) * 1024,
        };
      })
      .filter(Boolean);
  }

  if (process.platform === 'win32') {
    const output = safeExec(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-Process | Where-Object { $_.CPU -gt 0 } | Sort-Object CPU -Descending | Select-Object -First 18 Id,ProcessName,CPU,WorkingSet64 | ConvertTo-Csv -NoTypeInformation',
      ],
      3000
    );
    return output
      .split('\n')
      .slice(1)
      .map((line) => {
        const fields = parseCsvLine(line);
        if (fields.length < 4) return null;
        const pid = Number(fields[0]);
        if (!Number.isFinite(pid)) return null;
        return {
          pid,
          name: fields[1],
          cpu: Number(fields[2]) || 0,
          memory: 0,
          rss: Number(fields[3]) || 0,
        };
      })
      .filter(Boolean);
  }

  const output = safeExec('ps', ['-eo', 'pid,comm,pcpu,pmem,rss', '--sort=-pcpu', '--no-headers'], 1500);
  return output
    .split('\n')
    .filter((line) => line.trim())
    .slice(0, 18)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) return null;
      const pid = Number(parts[0]);
      if (!Number.isFinite(pid)) return null;
      return {
        pid,
        name: parts[1],
        cpu: Number(parts[2]) || 0,
        memory: Number(parts[3]) || 0,
        rss: (Number(parts[4]) || 0) * 1024,
      };
    })
    .filter(Boolean);
}

function parseXprop(raw) {
  const values = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const equals = trimmed.indexOf('=');
    if (equals !== -1) {
      const key = trimmed.slice(0, equals).replace(/\(.*/, '').trim();
      let value = trimmed.slice(equals + 1).trim();
      const quoted = value.match(/^"(.*)"$/);
      if (quoted) value = quoted[1].replace(/\\"/g, '"');
      values[key] = value;
      continue;
    }
    const colon = trimmed.indexOf(':');
    if (colon !== -1) {
      values[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim();
    }
  }
  return values;
}

function getWindowIds() {
  const raw = safeExec(
    'xprop',
    ['-root', '_NET_CLIENT_LIST_STACKING', '_NET_CLIENT_LIST'],
    1000
  );
  const ids = (raw.match(/0x[0-9a-fA-F]+/g) || []).filter(
    (id, index, all) => all.indexOf(id) === index
  );
  if (ids.length) return ids.slice(0, 40);

  const tree = safeExec('xwininfo', ['-root', '-children'], 1000);
  const fallback = [];
  for (const line of tree.split('\n')) {
    const match = line.match(/^\s*(0x[0-9a-fA-F]+)\s+"([^"]+)"/);
    if (!match) continue;
    if (/mutter|ibus|gsd|GNOME Shell|guard window/i.test(match[2])) continue;
    fallback.push(match[1]);
  }
  return fallback.slice(0, 40);
}

function getWindowGeometry(id) {
  const raw = safeExec('xwininfo', ['-id', id], 800);
  const read = (label) => {
    const match = raw.match(new RegExp(`${label}:\\s*(-?\\d+)`));
    return match ? Number(match[1]) : 0;
  };
  return {
    x: read('Absolute upper-left X'),
    y: read('Absolute upper-left Y'),
    width: read('Width'),
    height: read('Height'),
  };
}

function getWorkspaceInfo() {
  const raw = safeExec('xprop', ['-root', '_NET_DESKTOP_NAMES', '_NET_CURRENT_DESKTOP'], 1000);
  const namesLine = raw.match(/_NET_DESKTOP_NAMES\(UTF8_STRING\)\s*=\s*(.*)/);
  const names = namesLine
    ? Array.from(namesLine[1].matchAll(/"((?:[^"\\]|\\.)*)"/g), (match) => match[1])
    : [];
  const workspaces = names.length ? names : ['Desktop'];
  const currentMatch = raw.match(/_NET_CURRENT_DESKTOP:\s*(\d+)/);
  const currentIndex = currentMatch ? Number(currentMatch[1]) : 0;
  return {
    workspaces,
    currentWorkspace: workspaces[currentIndex] || workspaces[0] || null,
  };
}

function getLinuxWindows() {
  const { workspaces, currentWorkspace } = getWorkspaceInfo();
  const windows = [];
  for (const id of getWindowIds()) {
    const props = parseXprop(
      safeExec(
        'xprop',
        [
          '-id',
          id,
          'WM_NAME',
          '_NET_WM_NAME',
          '_NET_WM_PID',
          'WM_CLASS',
          '_NET_WM_DESKTOP',
          '_NET_WM_STATE',
        ],
        800
      )
    );
    const title = String(props._NET_WM_NAME || props.WM_NAME || '').trim();
    if (!title || /^(mutter|ibus|gsd|gnome-shell|mutter guard)/i.test(title)) continue;

    const classes = String(props.WM_CLASS || '')
      .split(',')
      .map((value) => value.trim().replace(/^"|"$/g, ''));
    const desktopIndex = Number(props._NET_WM_DESKTOP);
    const state = String(props._NET_WM_STATE || '');
    const pid = Number(props._NET_WM_PID);

    windows.push({
      id,
      title,
      app: classes[1] || classes[0] || title.split(/\s+/)[0] || 'Window',
      pid: Number.isFinite(pid) ? pid : null,
      workspace: Number.isFinite(desktopIndex)
        ? workspaces[desktopIndex] || currentWorkspace
        : currentWorkspace,
      ...getWindowGeometry(id),
      visible: !state.includes('_NET_WM_STATE_HIDDEN'),
    });
  }
  return {
    windows: windows.sort((a, b) => Number(b.visible) - Number(a.visible) || a.title.localeCompare(b.title)),
    workspaces,
    currentWorkspace,
    source: 'X11 · EWMH window list',
  };
}

function getWindowsWindows() {
  const output = safeExec(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Csv -NoTypeInformation',
    ],
    3000
  );
  const windows = output
    .split('\n')
    .slice(1)
    .map((line) => {
      const fields = parseCsvLine(line);
      if (fields.length < 3) return null;
      const pid = Number(fields[0]);
      return {
        id: `win-${pid}`,
        title: fields[2],
        app: fields[1],
        pid: Number.isFinite(pid) ? pid : null,
        workspace: null,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        visible: true,
      };
    })
    .filter(Boolean);
  return {
    windows,
    workspaces: ['Desktop'],
    currentWorkspace: 'Desktop',
    source: 'Windows · MainWindowTitle',
  };
}

function getMacWindows() {
  const output = safeExec(
    'osascript',
    ['-e', 'tell application "System Events" to get name of every process whose background only is false'],
    3000
  );
  const names = output
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return {
    windows: names.map((name, index) => ({
      id: `mac-${index}-${name}`,
      title: name,
      app: name,
      pid: null,
      workspace: null,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      visible: true,
    })),
    workspaces: ['Desktop'],
    currentWorkspace: 'Desktop',
    source: output ? 'macOS · System Events (names only)' : 'Window list unavailable',
  };
}

function getWindowData() {
  if (process.platform === 'linux') return getLinuxWindows();
  if (process.platform === 'win32') return getWindowsWindows();
  return getMacWindows();
}

function getLayoutSnapshot() {
  const cores = getCoreBase();
  const threadData = process.platform === 'linux' ? readLinuxThreads() : emptyThreadData();
  const processes = process.platform === 'linux' ? getLinuxProcesses(threadData) : getFallbackProcesses();

  const topByCore = new Map();
  for (const [pid, perCore] of threadData.pidCores) {
    for (const [core, load] of perCore) {
      const current = topByCore.get(core);
      if (!current || load > current.load) {
        topByCore.set(core, {
          pid,
          load,
          name: threadData.pidNames.get(pid) || String(pid),
        });
      }
    }
  }
  for (const core of cores) {
    const top = topByCore.get(core.index);
    if (top) {
      core.topProcess = top.name;
      core.topProcessPid = top.pid;
      core.topProcessLoad = Number(top.load.toFixed(1));
    }
  }

  const windows = getWindowData();
  return {
    timestamp: Date.now(),
    cores,
    processes,
    windows: windows.windows,
    workspaces: windows.workspaces,
    currentWorkspace: windows.currentWorkspace,
    sources: {
      cpu: threadData.pidCores.size ? 'os.cpus() + per-thread ps' : 'os.cpus()',
      processes: process.platform === 'linux' ? '/proc + ps threads' : 'platform process list',
      windows: windows.source,
    },
  };
}

module.exports = { getLayoutSnapshot };
