import os from 'node:os';
import { spawn } from 'node:child_process';

let cloudflareProcess = null;
let currentCloudflareUrl = null;
let isStartingCloudflare = false;

export function getCurrentCloudflareUrl() {
  return currentCloudflareUrl;
}

export function getLocalIpAddresses() {
  const nets = os.networkInterfaces();
  const results = [];
  let wifiIp = null;
  let hotspotIp = null;

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push({ name, address: net.address });
        const lower = name.toLowerCase();
        if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wireless')) {
          wifiIp = net.address;
        } else if (lower.includes('hotspot') || lower.includes('local area connection* 2')) {
          hotspotIp = net.address;
        }
      }
    }
  }

  if (!wifiIp && results.length > 0) {
    wifiIp = results[0].address;
  }
  if (!hotspotIp) {
    hotspotIp = '192.168.137.1';
  }

  return { wifiIp, hotspotIp, all: results };
}

export async function startManagedCloudflareTunnel(forceNew = false) {
  if (currentCloudflareUrl && cloudflareProcess && !forceNew) {
    return currentCloudflareUrl;
  }
  if (isStartingCloudflare && !forceNew) {
    return currentCloudflareUrl;
  }

  isStartingCloudflare = true;
  return new Promise((resolve) => {
    try {
      if (cloudflareProcess) {
        try { cloudflareProcess.kill(); } catch {}
        cloudflareProcess = null;
      }

      console.log('[Direct Website] Starting Cloudflare direct link (Trusted SSL, zero passwords, works on iOS & Android)...');
      const proc = spawn('npx', ['-y', 'cloudflared', 'tunnel', '--url', 'https://127.0.0.1:5173', '--no-tls-verify'], {
        shell: true,
      });

      cloudflareProcess = proc;
      let resolved = false;

      const handleData = (chunk) => {
        const text = chunk.toString();
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match && !resolved) {
          resolved = true;
          isStartingCloudflare = false;
          currentCloudflareUrl = match[0];
          console.log(`[Direct Website] ✓ Cloudflare Direct Link Online: ${currentCloudflareUrl}`);
          resolve(currentCloudflareUrl);
        }
      };

      proc.stdout.on('data', handleData);
      proc.stderr.on('data', handleData);

      proc.on('close', () => {
        console.warn('[Direct Website] Process closed. Reconnecting in 5s...');
        cloudflareProcess = null;
        currentCloudflareUrl = null;
        isStartingCloudflare = false;
        setTimeout(() => startManagedCloudflareTunnel(false), 5000);
      });

      proc.on('error', (err) => {
        console.error('[Direct Website] Process error:', err);
        cloudflareProcess = null;
        isStartingCloudflare = false;
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      });

      // 15 second safety timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          isStartingCloudflare = false;
          resolve(currentCloudflareUrl);
        }
      }, 15000);
    } catch (e) {
      console.error('[Direct Website] Spawn error:', e);
      isStartingCloudflare = false;
      resolve(null);
    }
  });
}
