#!/usr/bin/env node

/**
 * Sovereign MCP Launcher - @vitoria-rodrigues/mcp-linkedin
 * Enterprise Standard for @vitoria-rodrigues
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER_NAME = 'linkedin';

function loadEnvCascade() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
    path.resolve(__dirname, '..', '..', '..', '.env'),
    path.resolve(__dirname, '..', '..', '..', '..', '.env')
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      try {
        const raw = fs.readFileSync(envPath, 'utf8');
        for (const line of raw.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[k]) process.env[k] = v;
          }
        }
      } catch (e) {}
    }
  }
}
loadEnvCascade();

function initializeResumesDirectory() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  const pluginData = process.env.PLUGIN_DATA || path.join(homeDir, '.antigravity', 'data', 'linkedin');
  const resumesDir = process.env.LINKEDIN_RESUMES_DIR || path.join(pluginData, 'resumes');

  try {
    if (!fs.existsSync(resumesDir)) {
      fs.mkdirSync(resumesDir, { recursive: true });
    }

    const readmePath = path.join(resumesDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      const readmeContent = [
        '# Candidate Resumes Vault',
        '',
        'Place your tailored resume files (.md, .txt, .pdf) in this directory.',
        'The @vitoria-rodrigues/mcp-linkedin server scans this location during job applications',
        'to match requirements and extract candidate profile context.',
        '',
        'Recommended naming convention:',
        '- resume-general.md',
        '- resume-fullstack.md',
        '- resume-backend.md',
        '- resume-ai-engineer.md',
        ''
      ].join('\n');
      fs.writeFileSync(readmePath, readmeContent, 'utf8');
    }

    const sampleTemplate = path.join(resumesDir, 'resume-sample.md');
    if (!fs.existsSync(sampleTemplate)) {
      const sampleContent = [
        '# Software Engineer Resume',
        '',
        '## Contact',
        '- Location: Remote / Hybrid',
        '- Email: contato@vitoriarodrigues.dev',
        '',
        '## Professional Summary',
        'Senior Software Engineer specializing in distributed architectures, TypeScript monorepos,',
        'Model Context Protocol (MCP) integrations, and autonomous AI agent systems.',
        '',
        '## Core Competencies',
        '- Languages: TypeScript, JavaScript, Python, Go, SQL',
        '- Frameworks: React, Next.js, Fastify, Node.js',
        '- Architecture: Monorepos (pnpm, Turborepo), Microservices, REST, MCP, Docker, Kubernetes',
        '',
        '## Professional Experience',
        '### Staff Software Engineer (2024 - Present)',
        '- Architected enterprise agent mesh coordinating autonomous multi-agent workflows.',
        '- Built self-contained dual-transport MCP servers for developer tooling and web automation.',
        ''
      ].join('\n');
      fs.writeFileSync(sampleTemplate, sampleContent, 'utf8');
    }
  } catch (err) {
    process.stderr.write(`[launcher:mcp-${SERVER_NAME}] Warning: could not initialize resumes directory: ${err.message}\n`);
  }

  process.env.LINKEDIN_RESUMES_DIR = resumesDir;
  return resumesDir;
}

const resolvedResumesDir = initializeResumesDirectory();

function spawnCommand(bin, args, options = {}) {
  const isWin = process.platform === 'win32';
  if (isWin && (bin === 'npx' || bin.endsWith('.cmd') || bin.endsWith('.bat'))) {
    return spawn('cmd.exe', ['/d', '/s', '/c', bin, ...args], {
      stdio: 'inherit',
      shell: false,
      env: process.env,
      ...options
    });
  }
  return spawn(bin, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
    ...options
  });
}

const forwardedArgs = process.argv.slice(2);
const profile = process.env.MESH_PROFILE || 'local';
const isClusterMode = profile === 'cluster' || process.env.CORTEX_GATEWAY_ENABLED === 'true';
const gatewayBaseUrl = process.env.CORTEX_GATEWAY_URL || 'http://localhost:8080';

if (isClusterMode) {
  process.stderr.write(`[launcher:mcp-${SERVER_NAME}] Engaging cluster gateway via ${gatewayBaseUrl}/mcp\n`);
  const child = spawnCommand('npx', ['-y', 'mcp-remote', `${gatewayBaseUrl}/mcp`]);
  child.on('exit', (code) => process.exit(code || 0));
} else {
  const bundledBin = path.resolve(__dirname, '..', 'dist', 'bin.cjs');
  const srcTsBin = path.resolve(__dirname, '..', 'src', 'bin.ts');

  if (fs.existsSync(bundledBin)) {
    const child = spawn(process.execPath, [bundledBin, ...forwardedArgs], {
      stdio: 'inherit',
      shell: false,
      env: process.env
    });
    child.on('exit', (code) => process.exit(code || 0));
    child.on('error', (err) => {
      process.stderr.write(`[launcher:mcp-${SERVER_NAME}] Failed to spawn bundled binary: ${err.message}\n`);
      process.exit(1);
    });
  } else if (fs.existsSync(srcTsBin)) {
    const child = spawnCommand('npx', ['-y', 'tsx', srcTsBin, ...forwardedArgs]);
    child.on('exit', (code) => process.exit(code || 0));
  } else {
    process.stderr.write(`[launcher:mcp-${SERVER_NAME}] Engaging upstream fallback runner: uvx mcp-server-linkedin@latest\n`);
    const child = spawnCommand('uvx', ['mcp-server-linkedin@latest', ...forwardedArgs]);
    child.on('exit', (code) => process.exit(code || 0));
    child.on('error', (err) => {
      process.stderr.write(`[launcher:mcp-${SERVER_NAME}] Upstream uvx runner failed: ${err.message}. Ensure uv is installed.\n`);
      process.exit(1);
    });
  }
}
