'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let lastSuccessfulSnapshot = null;

function run(command, args, timeout = 4000) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseJson(raw) {
  const start = raw.indexOf('{');
  if (start === -1) throw new Error('Orca CLI returned no JSON');
  return JSON.parse(raw.slice(start));
}

function orcaCandidates() {
  const candidates = [];
  if (process.env.ORCA_CLI_COMMAND) candidates.push(process.env.ORCA_CLI_COMMAND);
  if (process.env.ORCA_DEV_REPO_ROOT) candidates.push('orca-dev');

  if (process.platform === 'linux') {
    const home = os.homedir();
    candidates.push(path.join(home, '.config/orca/linux-orca-cli-shim/orca'));
    candidates.push(path.join(home, '.local/bin/orca-ide'));
    candidates.push('/usr/local/bin/orca-ide');
  } else {
    candidates.push('orca');
  }

  return candidates.filter((command, index) => command && candidates.indexOf(command) === index);
}

function invokeOrca(args) {
  const errors = [];
  for (const command of orcaCandidates()) {
    if (path.isAbsolute(command) && !fs.existsSync(command)) continue;
    try {
      return run(command, args);
    } catch (error) {
      errors.push(`${command}: ${error.message}`);
    }
  }
  throw new Error(errors[0] || 'Orca CLI is not available');
}

function short(value, max = 240) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function normalizeState(rawState, mainAgent) {
  const state = String(rawState || mainAgent?.state || 'unknown').toLowerCase();
  if (state === 'working' || state === 'running' || state === 'thinking' || state === 'active') {
    return 'working';
  }
  if (
    state === 'needs-input' ||
    state === 'needs_input' ||
    state === 'needsinput' ||
    state === 'waiting' ||
    state === 'awaiting-input'
  ) {
    return 'needs-input';
  }
  if (state === 'failed' || state === 'error' || mainAgent?.outcome === 'failure') return 'failed';
  if (state === 'done' || state === 'completed' || state === 'success' || mainAgent?.outcome === 'success') {
    return 'done';
  }
  return 'unknown';
}

function toolInputText(input) {
  if (input == null) return null;
  if (typeof input === 'string') return short(input, 180);
  try {
    return short(JSON.stringify(input), 180);
  } catch {
    return null;
  }
}

function normalizeAgent(agent, worktree, worktreeAgents) {
  const detail =
    worktreeAgents.find((entry) => entry.paneKey && entry.paneKey === agent.paneKey) ||
    worktreeAgents.find(
      (entry) => entry.orcaSessionId && entry.orcaSessionId === agent.orcaSessionId
    ) ||
    {};
  const mainAgent = detail.mainAgent || {};
  const updatedAt = Number(agent.updatedAt || detail.updatedAt || 0);
  const title =
    short(agent.title || detail.taskTitle || detail.activity?.title || detail.conversationName, 90) ||
    `${agent.agent || detail.agentType || 'Agent'} session`;

  return {
    id: String(agent.orcaSessionId || agent.paneKey || `${title}-${updatedAt}`),
    name: title,
    agentType: String(agent.agent || detail.agentType || 'agent'),
    state: normalizeState(agent.state, mainAgent),
    kind:
      agent.kind === 'chat' || agent.kind === 'terminal'
        ? agent.kind
        : 'unknown',
    workspace: short(agent.workspace || worktree?.displayName || worktree?.repo, 60) || 'Unknown',
    repo: short(agent.repo || worktree?.repo, 60) || '',
    worktreeId: String(agent.worktreeId || worktree?.worktreeId || ''),
    path: String(worktree?.path || ''),
    branch: String(worktree?.branch || '').replace(/^refs\/heads\//, ''),
    title,
    prompt: short(detail.prompt, 240),
    lastMessage: short(agent.lastAssistantMessage || detail.lastAssistantMessage, 260),
    toolName: detail.toolName ? String(detail.toolName) : null,
    toolInput: toolInputText(detail.toolInput),
    activity: short(detail.activity?.title, 90) || null,
    outcome: mainAgent.outcome ? String(mainAgent.outcome) : null,
    updatedAt,
    childCount: Array.isArray(detail.children) ? detail.children.length : 0,
  };
}

function normalizeWorktree(worktree) {
  const detailAgents = Array.isArray(worktree.agents) ? worktree.agents : [];
  const agents = detailAgents.map((agent) => normalizeAgent(agent, worktree, detailAgents));
  return {
    id: String(worktree.worktreeId || ''),
    name: short(worktree.displayName || worktree.repo, 60) || 'Untitled workspace',
    repo: short(worktree.repo, 60) || '',
    path: String(worktree.path || ''),
    branch: String(worktree.branch || '').replace(/^refs\/heads\//, ''),
    status: String(worktree.status || worktree.workspaceStatus || 'unknown'),
    isActive: Boolean(worktree.isActive),
    isMain: Boolean(worktree.isMainWorktree),
    lastActivityAt: Number(worktree.lastActivityAt || 0),
    agents,
  };
}

function getAgentsSnapshot() {
  const timestamp = Date.now();
  try {
    const agentEnvelope = parseJson(invokeOrca(['agent', 'list', '--json']));
    const worktreeEnvelope = parseJson(invokeOrca(['worktree', 'ps', '--json']));

    if (agentEnvelope.ok === false || worktreeEnvelope.ok === false) {
      throw new Error('Orca CLI reported an unsuccessful response');
    }

    const rawAgents = agentEnvelope.result?.agents || [];
    const rawWorktrees = worktreeEnvelope.result?.worktrees || [];
    const worktreeById = new Map(rawWorktrees.map((worktree) => [worktree.worktreeId, worktree]));

    const worktrees = rawWorktrees.map(normalizeWorktree).sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.lastActivityAt - a.lastActivityAt;
    });

    const agents = rawAgents
      .map((agent) => {
        const worktree = worktreeById.get(agent.worktreeId);
        const detailAgents = Array.isArray(worktree?.agents) ? worktree.agents : [];
        return normalizeAgent(agent, worktree, detailAgents);
      })
      .sort((a, b) => {
        const rank = { working: 0, 'needs-input': 1, failed: 2, done: 3, unknown: 4 };
        return (rank[a.state] ?? 5) - (rank[b.state] ?? 5) || b.updatedAt - a.updatedAt;
      });

    const snapshot = {
      available: true,
      source: 'orca-cli',
      error: null,
      agents,
      worktrees,
      updatedAt: timestamp,
    };
    lastSuccessfulSnapshot = snapshot;
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (lastSuccessfulSnapshot) {
      return { ...lastSuccessfulSnapshot, available: false, error: message };
    }
    return {
      available: false,
      source: 'orca-cli',
      error: message,
      agents: [],
      worktrees: [],
      updatedAt: timestamp,
    };
  }
}

module.exports = { getAgentsSnapshot };
