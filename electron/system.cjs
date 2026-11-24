'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PKG_VERSION = require('../package.json').version;

let previousCpu = null;
let previousNet = null;

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

function safeExec(command, args, timeout = 1500) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function runPowerShell(command) {
  return safeExec('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], 3000);
}

function parseOsRelease() {
  if (process.platform === 'darwin') {
    const version = safeExec('sw_vers', ['-productVersion'], 1500);
    return version ? `macOS ${version}` : `macOS ${os.release()}`;
  }
  if (process.platform === 'win32') {
    return `Windows ${os.release()}`;
  }
  const raw = readFile('/etc/os-release');
  const result = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) {
      result[match[1]] = match[2].replace(/^"|"$/g, '');
    }
  }
  return result.PRETTY_NAME || result.NAME || `${os.type()} ${os.release()}`;
}

function getMemory() {
  const raw = readFile('/proc/meminfo');
  const values = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z]+):\s+(\d+)\s+kB/);
    if (match) values[match[1]] = Number(match[2]) * 1024;
  }
  const total = values.MemTotal || os.totalmem();
  const available = values.MemAvailable || values.MemFree || os.freemem();
  const used = Math.max(0, total - available);
  const swapTotal = values.SwapTotal || 0;
  const swapFree = values.SwapFree || 0;
  return {
    total,
    used,
    free: values.MemFree || available,
    available,
    swapTotal,
    swapUsed: Math.max(0, swapTotal - swapFree),
    percent: total ? clamp((used / total) * 100, 0, 100) : 0,
  };
}

function getCpu() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }

  let usage = 0;
  if (previousCpu) {
    const idleDelta = idle - previousCpu.idle;
    const totalDelta = total - previousCpu.total;
    if (totalDelta > 0) usage = clamp((1 - idleDelta / totalDelta) * 100, 0, 100);
  }
  previousCpu = { idle, total };

  return {
    model: cpus.length ? cpus[0].model.replace(/\s+/g, ' ').trim() : 'Unknown processor',
    cores: cpus.length,
    threads: cpus.length,
    speedMHz: cpus.length ? cpus[0].speed : 0,
    usage,
    load: os.loadavg().map((value) => Number(value.toFixed(2))),
  };
}

function readNetDev() {
  const raw = readFile('/proc/net/dev');
  const result = {};
  for (const line of raw.split('\n').slice(2)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim();
    const fields = line.slice(colon + 1).trim().split(/\s+/);
    if (fields.length < 9) continue;
    result[name] = {
      rxBytes: Number(fields[0]) || 0,
      txBytes: Number(fields[8]) || 0,
    };
  }
  return result;
}

function readNetworkCounters() {
  if (process.platform === 'darwin') {
    const output = safeExec('netstat', ['-ib']);
    const lines = output.split('\n').filter((line) => line.trim());
    if (lines.length > 1) {
      const header = lines[0].trim().split(/\s+/);
      const rxIndex = header.indexOf('Ibytes');
      const txIndex = header.indexOf('Obytes');
      const counters = {};
      if (rxIndex !== -1 && txIndex !== -1) {
        for (const line of lines.slice(1)) {
          const fields = line.trim().split(/\s+/);
          if (fields.length <= Math.max(rxIndex, txIndex)) continue;
          const rxBytes = Number(fields[rxIndex]);
          const txBytes = Number(fields[txIndex]);
          if (!Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) continue;
          counters[fields[0]] = { rxBytes, txBytes };
        }
      }
      if (Object.keys(counters).length) {
        return { counters, hasCounters: true, source: 'darwin' };
      }
    }
  }

  if (process.platform === 'win32') {
    const output = runPowerShell(
      'Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Csv -NoTypeInformation'
    );
    const counters = {};
    for (const line of output.split('\n').slice(1)) {
      if (!line.trim()) continue;
      const fields = parseCsvLine(line);
      if (fields.length < 3) continue;
      const rxBytes = Number(fields[1]);
      const txBytes = Number(fields[2]);
      if (!Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) continue;
      counters[fields[0]] = { rxBytes, txBytes };
    }
    if (Object.keys(counters).length) {
      return { counters, hasCounters: true, source: 'win32' };
    }
  }

  const counters = readNetDev();
  return {
    counters,
    hasCounters: Object.keys(counters).length > 0,
    source: 'linux',
  };
}

function getNetwork() {
  const now = Date.now();
  const { counters: raw, hasCounters, source } = readNetworkCounters();
  const addressMap = new Map();
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    addressMap.set(
      name,
      (entries || []).find((entry) => entry.family === 'IPv4' && !entry.internal) ||
        (entries || []).find((entry) => entry.family === 'IPv4') ||
        null
    );
  }

  const elapsed = previousNet ? Math.max((now - previousNet.time) / 1000, 0.001) : 0;
  let downloadBps = 0;
  let uploadBps = 0;
  let totalRx = 0;
  let totalTx = 0;

  let names;
  if (hasCounters) {
    names = Object.keys(raw).filter(
      (name) => name !== 'lo' && !name.startsWith('virbr') && !name.startsWith('sit')
    );
  } else {
    names = Object.keys(os.networkInterfaces()).filter((name) => !name.startsWith('lo'));
  }

  const interfaces = names
    .map((name) => {
      const ifaceCounters = raw[name];
      if (!ifaceCounters) return null;
      const previous = previousNet && previousNet.interfaces[name];
      const rxDelta = previous ? Math.max(0, ifaceCounters.rxBytes - previous.rxBytes) : 0;
      const txDelta = previous ? Math.max(0, ifaceCounters.txBytes - previous.txBytes) : 0;
      const downloadSpeed = elapsed ? rxDelta / elapsed : 0;
      const uploadSpeed = elapsed ? txDelta / elapsed : 0;
      totalRx += ifaceCounters.rxBytes;
      totalTx += ifaceCounters.txBytes;
      downloadBps += downloadSpeed;
      uploadBps += uploadSpeed;
      const address = addressMap.get(name);
      const entries = os.networkInterfaces()[name] || [];
      return {
        name,
        ip: address ? address.address : '—',
        mac: address && address.mac && address.mac !== '00:00:00:00:00:00' ? address.mac : '—',
        rxBytes: ifaceCounters.rxBytes,
        txBytes: ifaceCounters.txBytes,
        downloadBps: downloadSpeed,
        uploadBps: uploadSpeed,
        state: source === 'linux'
          ? readFile(`/sys/class/net/${name}/operstate`) || 'unknown'
          : entries.some((entry) => !entry.internal)
            ? 'up'
            : 'down',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes));

  previousNet = { time: now, interfaces: raw };
  return { downloadBps, uploadBps, totalRx, totalTx, interfaces };
}

function getDisks() {
  let targets;
  if (process.platform === 'win32') {
    targets = [
      { mount: 'C:\\', label: 'System' },
      { mount: 'D:\\', label: 'Data' },
    ];
  } else if (process.platform === 'darwin') {
    targets = [
      { mount: '/', label: 'System' },
      { mount: '/System/Volumes/Data', label: 'Data' },
    ];
  } else {
    targets = [
      { mount: '/', label: 'System' },
      { mount: '/home', label: 'Home' },
      { mount: '/tmp', label: 'Temp' },
    ];
  }
  const seen = new Set();
  const result = [];

  for (const target of targets) {
    if (seen.has(target.mount)) continue;
    seen.add(target.mount);
    try {
      const stats = fs.statfsSync(target.mount);
      const blockSize = stats.bsize || 4096;
      const total = stats.blocks * blockSize;
      const free = stats.bavail * blockSize;
      const used = Math.max(0, total - free);
      if (!total) continue;
      result.push({
        mount: target.mount,
        label: target.label,
        total,
        used,
        free,
        percent: clamp((used / total) * 100, 0, 100),
      });
    } catch {
      // Mount point is not available on this machine.
    }
  }
  return result;
}

function listHwmonDirs() {
  try {
    return fs
      .readdirSync('/sys/class/hwmon')
      .map((name) => path.join('/sys/class/hwmon', name))
      .filter((dir) => {
        try {
          return fs.statSync(dir).isDirectory() || fs.statSync(dir).isSymbolicLink();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

function getFans() {
  const fans = [];
  for (const dir of listHwmonDirs()) {
    const chipName = readFile(path.join(dir, 'name')) || 'Hardware monitor';
    let files = [];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const match = file.match(/^fan(\d+)_input$/);
      if (!match) continue;
      const rpm = Number(readFile(path.join(dir, file)));
      if (!Number.isFinite(rpm)) continue;
      const index = match[1];
      const label = readFile(path.join(dir, `fan${index}_label`));
      fans.push({
        name: label || `${chipName} Fan ${index}`,
        rpm: Math.round(rpm),
      });
    }
  }
  return fans.sort((a, b) => b.rpm - a.rpm);
}

function getTemperatures() {
  const temps = [];

  try {
    for (const name of fs.readdirSync('/sys/class/thermal')) {
      if (!name.startsWith('thermal_zone')) continue;
      const dir = path.join('/sys/class/thermal', name);
      const raw = Number(readFile(path.join(dir, 'temp')));
      if (!Number.isFinite(raw)) continue;
      const type = (readFile(path.join(dir, 'type')) || name).replace(/_/g, ' ');
      temps.push({
        name: type === name ? `Thermal zone ${name.replace('thermal_zone', '')}` : type,
        celsius: Number((raw / 1000).toFixed(1)),
      });
    }
  } catch {
    // Thermal interface not exposed.
  }

  for (const dir of listHwmonDirs()) {
    const chipName = readFile(path.join(dir, 'name')) || 'sensor';
    let files = [];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const match = file.match(/^temp(\d+)_input$/);
      if (!match) continue;
      const raw = Number(readFile(path.join(dir, file)));
      if (!Number.isFinite(raw)) continue;
      const index = match[1];
      const label = readFile(path.join(dir, `temp${index}_label`));
      temps.push({
        name: label || `${chipName} ${index}`,
        celsius: Number((raw / 1000).toFixed(1)),
      });
    }
  }

  const unique = new Map();
  for (const temp of temps) {
    if (!unique.has(temp.name)) unique.set(temp.name, temp);
  }
  return Array.from(unique.values()).slice(0, 10);
}

function getGpu() {
  if (process.platform === 'darwin') {
    const output = safeExec('system_profiler', ['SPDisplaysDataType'], 3000);
    const line = output.split('\n').find((entry) => /chipset|vendor|device id/i.test(entry));
    if (!line) return 'Apple GPU';
    return line.split(':').slice(1).join(':').trim() || 'Apple GPU';
  }

  if (process.platform === 'win32') {
    const output = runPowerShell(
      'Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name'
    );
    return output.trim().split('\n')[0] || 'Not detected';
  }

  const output = safeExec('lspci', ['-nn']);
  const line = output
    .split('\n')
    .find((entry) => /vga|3d controller|display controller/i.test(entry));
  if (!line) return 'Not detected';
  return line
    .replace(/^[^:]+:\s*/, '')
    .replace(/^(vga compatible controller|3d controller|display controller)\s*\[[^\]]+\]\s*:\s*/i, '')
    .replace(/\s*\[[0-9a-f]{4}:[0-9a-f]{4}\]\s*/gi, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Graphics controller';
}

function getBoard() {
  if (process.platform === 'darwin') {
    return {
      vendor: 'Apple',
      product: safeExec('sysctl', ['-n', 'hw.model']) || 'Mac',
      bios: safeExec('sysctl', ['-n', 'kern.osversion']) || 'Unknown',
    };
  }

  if (process.platform === 'win32') {
    const output = runPowerShell(
      '$c = Get-CimInstance Win32_ComputerSystem; $b = Get-CimInstance Win32_BIOS; ' +
        '"$($c.Manufacturer)|$($c.Model)|$($b.SMBIOSBIOSVersion)"'
    );
    const [vendor, product, bios] = output.split('|').map((value) => value.trim());
    return {
      vendor: vendor || 'Unknown',
      product: product || 'Unknown',
      bios: bios || 'Unknown',
    };
  }

  const base = '/sys/class/dmi/id';
  return {
    vendor: readFile(path.join(base, 'sys_vendor')) || 'Unknown',
    product: readFile(path.join(base, 'product_name')) || 'Unknown',
    bios: readFile(path.join(base, 'bios_version')) || 'Unknown',
  };
}

function getBattery() {
  if (process.platform === 'darwin') {
    const output = safeExec('pmset', ['-g', 'batt']);
    const match = output.match(/(\d+)%/);
    if (!match) return null;
    const status = /discharging/i.test(output)
      ? 'Discharging'
      : /charging/i.test(output)
        ? 'Charging'
        : /fully charged/i.test(output)
          ? 'Fully charged'
          : 'Unknown';
    return { capacity: clamp(Number(match[1]), 0, 100), status };
  }

  if (process.platform === 'win32') {
    const output = runPowerShell(
      '$b = Get-CimInstance Win32_Battery | Select-Object -First 1; ' +
        'if ($b) { "$($b.EstimatedChargeRemaining)|$($b.BatteryStatus)" }'
    );
    if (!output.trim()) return null;
    const [capacity, code] = output.trim().split('|');
    const statuses = {
      1: 'Discharging',
      2: 'On AC power',
      3: 'Fully charged',
      4: 'Low',
      5: 'Charging',
      6: 'Unknown',
    };
    return {
      capacity: clamp(Number(capacity) || 0, 0, 100),
      status: statuses[Number(code)] || 'Unknown',
    };
  }

  let names = [];
  try {
    names = fs.readdirSync('/sys/class/power_supply').filter((name) => name.startsWith('BAT'));
  } catch {
    return null;
  }
  if (!names.length) return null;
  const dir = path.join('/sys/class/power_supply', names[0]);
  const capacity = Number(readFile(path.join(dir, 'capacity')));
  if (!Number.isFinite(capacity)) return null;
  return {
    capacity: clamp(capacity, 0, 100),
    status: readFile(path.join(dir, 'status')) || 'Unknown',
  };
}

function parseCsvLine(line) {
  const quoted = line.match(/"([^"]*)"/g);
  if (quoted && quoted.length) return quoted.map((value) => value.slice(1, -1));
  return line.split(',').map((value) => value.trim());
}

function getProcesses() {
  if (process.platform === 'win32') {
    const output = runPowerShell(
      'Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | ' +
        'Where-Object { $_.Name -ne "_Total" -and $_.Name -ne "Idle" } | ' +
        'Sort-Object PercentProcessorTime -Descending | Select-Object -First 8 ' +
        'Name,IDProcess,PercentProcessorTime,WorkingSetPrivate | ConvertTo-Csv -NoTypeInformation'
    );
    return output
      .split('\n')
      .slice(1, 9)
      .map((line) => {
        const fields = parseCsvLine(line);
        if (fields.length < 4) return null;
        const pid = Number(fields[1]);
        if (!Number.isFinite(pid)) return null;
        return {
          pid,
          name: fields[0],
          cpu: Number(fields[2]) || 0,
          memory: 0,
          rss: Number(fields[3]) || 0,
        };
      })
      .filter(Boolean);
  }

  const isMac = process.platform === 'darwin';
  const output = isMac
    ? safeExec('ps', ['-eo', 'pid,comm,pcpu,pmem,rss', '-r'])
    : safeExec('ps', ['-eo', 'pid,comm,pcpu,pmem,rss', '--sort=-pcpu', '--no-headers']);
  if (!output) return [];

  return output
    .split('\n')
    .filter((line) => !/^\s*PID\s/.test(line))
    .slice(0, 8)
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

function createSnapshot(display) {
  return {
    timestamp: Date.now(),
    hostname: os.hostname(),
    os: {
      prettyName: parseOsRelease(),
      kernel: os.release(),
      arch: os.arch(),
      uptimeSeconds: Math.floor(os.uptime()),
    },
    cpu: getCpu(),
    memory: getMemory(),
    disks: getDisks(),
    network: getNetwork(),
    fans: getFans(),
    temperatures: getTemperatures(),
    gpu: getGpu(),
    board: getBoard(),
    battery: getBattery(),
    processes: getProcesses(),
    display: display || { width: 0, height: 0, scaleFactor: 1 },
    appVersion: PKG_VERSION,
  };
}

module.exports = { createSnapshot };
