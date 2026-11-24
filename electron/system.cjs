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

function parseOsRelease() {
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

function getNetwork() {
  const now = Date.now();
  const raw = readNetDev();
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

  const interfaces = Object.entries(raw)
    .filter(([name]) => name !== 'lo' && !name.startsWith('virbr') && !name.startsWith('sit'))
    .map(([name, counters]) => {
      const previous = previousNet && previousNet.interfaces[name];
      const rxDelta = previous ? Math.max(0, counters.rxBytes - previous.rxBytes) : 0;
      const txDelta = previous ? Math.max(0, counters.txBytes - previous.txBytes) : 0;
      const downloadSpeed = elapsed ? rxDelta / elapsed : 0;
      const uploadSpeed = elapsed ? txDelta / elapsed : 0;
      totalRx += counters.rxBytes;
      totalTx += counters.txBytes;
      downloadBps += downloadSpeed;
      uploadBps += uploadSpeed;
      const address = addressMap.get(name);
      return {
        name,
        ip: address ? address.address : '—',
        mac: address && address.mac && address.mac !== '00:00:00:00:00:00' ? address.mac : '—',
        rxBytes: counters.rxBytes,
        txBytes: counters.txBytes,
        downloadBps: downloadSpeed,
        uploadBps: uploadSpeed,
        state: readFile(`/sys/class/net/${name}/operstate`) || 'unknown',
      };
    })
    .sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes));

  previousNet = { time: now, interfaces: raw };
  return { downloadBps, uploadBps, totalRx, totalTx, interfaces };
}

function getDisks() {
  const targets = [
    { mount: '/', label: 'System' },
    { mount: '/home', label: 'Home' },
    { mount: '/tmp', label: 'Temp' },
  ];
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
  const output = safeExec('lspci', ['-nn']);
  const line = output
    .split('\n')
    .find((entry) => /vga|3d controller|display controller/i.test(entry));
  if (!line) return 'Not detected';
  return line
    .replace(/^[^:]+:\s*/, '')
    .replace(/^(vga compatible controller|3d controller|display controller)\s*\[[^\]]+\]\s*:\s*/i, '')
    .replace(/\s*\[[0-9a-f]{4}:[0-9a-f]{4}\]\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Graphics controller';
}

function getBoard() {
  const base = '/sys/class/dmi/id';
  return {
    vendor: readFile(path.join(base, 'sys_vendor')) || 'Unknown',
    product: readFile(path.join(base, 'product_name')) || 'Unknown',
    bios: readFile(path.join(base, 'bios_version')) || 'Unknown',
  };
}

function getBattery() {
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

function getProcesses() {
  const output = safeExec('ps', ['-eo', 'pid,comm,pcpu,pmem,rss', '--sort=-pcpu', '--no-headers']);
  if (!output) return [];
  return output
    .split('\n')
    .slice(0, 8)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) return null;
      return {
        pid: Number(parts[0]),
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
