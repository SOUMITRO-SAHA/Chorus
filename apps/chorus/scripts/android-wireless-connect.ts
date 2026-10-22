#!/usr/bin/env bun
/**
 * Unified Android Wireless Debug Connection Manager
 * Handles USB auto-detection, primary IP caching (.last-wireless-device),
 * quick connection, and interactive device management.
 *
 * Default flow is PRIMARY-FIRST: the cached endpoint in .last-wireless-device
 * is always attempted before mDNS discovery or USB. Stale cached ports
 * (Android 11+ rotates them) are auto-rescued via mDNS for the same IP.
 *
 * Supports Android 11+ Wireless Debugging (dynamic ports via mDNS)
 * and legacy Android 10- (port 5555 via adb tcpip).
 */
import { join } from "path";
import { createInterface, type Interface } from "readline";

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function writeLine(message: string = ""): void {
  process.stdout.write(`${message}\n`);
}

function colorLog(color: keyof typeof colors, message: string): void {
  writeLine(`${colors[color]}${message}${colors.reset}`);
}

const PROJECT_ROOT = join(import.meta.dir, "..");
const LAST_DEVICE_FILE = join(PROJECT_ROOT, ".last-wireless-device");

let _rl: Interface | null = null;

function getRL(): Interface {
  if (!_rl) {
    _rl = createInterface({ input: process.stdin, output: process.stdout });
    _rl.on("close", () => {
      _rl = null;
    });
  }
  return _rl;
}

function closeRL(): void {
  _rl?.close();
  _rl = null;
}

async function prompt(question: string): Promise<string> {
  process.stdout.write(`${colors.cyan}${question}${colors.reset} `);
  return new Promise((resolve) => {
    const rl = getRL();
    rl.resume();
    rl.once("line", (answer: string) => resolve(answer.trim()));
  });
}

export function parseIpPort(input: string): {
  ip: string;
  port: number | undefined;
} {
  const value = input.trim();
  const bracketed = value.match(/^\[([^\]]+)](?::(\d+))?$/);
  if (bracketed?.[1]) {
    const parsedPort = bracketed[2] ? Number(bracketed[2]) : undefined;
    return {
      ip: bracketed[1],
      port: parsedPort !== undefined && parsedPort >= 1 && parsedPort <= 65535
        ? parsedPort
        : undefined,
    };
  }

  const colonCount = (value.match(/:/g) ?? []).length;
  if (colonCount !== 1) {
    return { ip: value, port: undefined };
  }

  const colonIdx = value.lastIndexOf(":");
  const parsedPort = Number(value.slice(colonIdx + 1));
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    return { ip: value, port: undefined };
  }

  return { ip: value.slice(0, colonIdx).trim(), port: parsedPort };
}

function formatIpPort(ip: string, port: number): string {
  const host = ip.includes(":") ? `[${ip}]` : ip;
  return `${host}:${port}`;
}

export function createAdbPairCommand(target: string, code: string): string[] {
  return ["adb", "pair", target, code];
}

export function createAndroidDevCommand(): string[] {
  return ["bun", "run", "android:wireless:start"];
}

async function getLastDevice(): Promise<string | null> {
  try {
    const text = await Bun.file(LAST_DEVICE_FILE).text();
    return text.trim() || null;
  } catch {
    return null;
  }
}

async function saveLastDevice(ip: string, port: number = 5555): Promise<void> {
  const entry = port === 5555 ? ip : `${ip}:${port}`;
  await Bun.write(LAST_DEVICE_FILE, `${entry}\n`);
  colorLog("blue", `[ADB] Primary IP saved to ${LAST_DEVICE_FILE}: ${entry}`);
}

async function checkADB(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["adb", "version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

function stripPort(ip: string): string {
  return parseIpPort(ip).ip;
}

export type AdbTransport = "emulator" | "usb" | "wireless-ip" | "wireless-mdns";

export function classifyAdbSerial(serial: string): AdbTransport {
  if (/^emulator-\d+$/.test(serial)) return "emulator";
  if (serial.includes("._adb-tls-") || serial.includes("._tcp")) {
    return "wireless-mdns";
  }
  if (parseIpPort(serial).port !== undefined) return "wireless-ip";
  return "usb";
}

async function pingHost(ip: string): Promise<boolean> {
  const cleanIp = stripPort(ip);
  try {
    colorLog("blue", `[PING] Checking reachability of ${cleanIp}...`);
    const proc = Bun.spawn(
      ["ping", "-c", "2", "-W", "1500", "-t", "5", cleanIp],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    if (exitCode === 0) {
      const match = stdout.match(/(\d+) packets received/);
      const received = match?.[1] ? parseInt(match[1], 10) : 0;
      colorLog(
        "green",
        `[PING] ${cleanIp} is reachable (${received} packets received)`,
      );
      return true;
    }

    colorLog("red", `[PING] ${cleanIp} is NOT reachable.`);
    if (stderr.trim()) {
      colorLog("red", `        ${stderr.trim().split("\n")[0]}`);
    }
    const stderrHint = (stdout + stderr).toLowerCase();
    if (stderrHint.includes("no route to host")) {
      colorLog(
        "yellow",
        "        → Device is off, Wi-Fi is off, or IP changed.",
      );
    } else if (
      stderrHint.includes("request timeout")
      || stderrHint.includes("100% packet loss")
    ) {
      colorLog(
        "yellow",
        "        → Device may be on a different subnet or blocking ICMP.",
      );
    }
    return false;
  } catch (error) {
    colorLog("red", `[PING] Failed to run ping: ${error}`);
    return false;
  }
}

async function getLocalIp(): Promise<string | null> {
  for (const iface of ["en0", "en1"]) {
    try {
      const proc = Bun.spawn(["ipconfig", "getifaddr", iface], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [exitCode, stdout] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
      ]);
      const ip = stdout.trim();
      if (exitCode === 0 && /^[0-9.]+\.[0-9.]+$/.test(ip)) {
        return ip;
      }
    } catch {
      // try next interface
    }
  }
  return null;
}

async function isSameSubnet(targetIp: string): Promise<boolean | null> {
  const cleanTarget = stripPort(targetIp);
  const localIp = await getLocalIp();
  if (!localIp) return null;

  const localParts = localIp.split(".");
  const targetParts = cleanTarget.split(".");
  if (localParts.length < 3 || targetParts.length < 3) return null;

  const same = localParts[0] === targetParts[0]
    && localParts[1] === targetParts[1]
    && localParts[2] === targetParts[2];
  if (!same) {
    colorLog(
      "yellow",
      `[NET]  Local IP is ${localIp} but target is ${cleanTarget} — different subnets!`,
    );
    colorLog(
      "yellow",
      `       Make sure both Mac and phone are on the same Wi-Fi network.`,
    );
  } else {
    colorLog(
      "green",
      `[NET]  Same subnet (local: ${localIp}, target: ${cleanTarget})`,
    );
  }
  return same;
}

async function checkPort(ip: string, port: number): Promise<boolean> {
  const cleanIp = stripPort(ip);
  try {
    const proc = Bun.spawn(["nc", "-z", "-w", "3", cleanIp, String(port)], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      colorLog("green", `[PORT] Port ${port} on ${cleanIp} is OPEN`);
      return true;
    }
    colorLog("red", `[PORT] Port ${port} on ${cleanIp} is CLOSED`);
    return false;
  } catch {
    colorLog(
      "yellow",
      `[PORT] Could not check port ${port} (nc missing?), will proceed anyway.`,
    );
    return true;
  }
}

async function getConnectedDevices(): Promise<string[]> {
  try {
    const proc = Bun.spawn(["adb", "devices"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const lines = output.split("\n");
    const devices: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("List of devices")) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2 && parts[1] === "device") {
          devices.push(parts[0]);
        }
      }
    }

    return devices;
  } catch (error) {
    colorLog("red", `Failed to get devices: ${error}`);
    return [];
  }
}

/**
 * All adb transports including offline/unauthorized ones. `getConnectedDevices`
 * hides offline transports, which hides exactly the stale entries that need
 * cleanup after a disconnect.
 */
async function getAdbTransports(): Promise<
  { serial: string; state: string; }[]
> {
  try {
    const proc = Bun.spawn(["adb", "devices"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const transports: { serial: string; state: string; }[] = [];

    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("List of devices")) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          transports.push({ serial: parts[0], state: parts[1] });
        }
      }
    }

    return transports;
  } catch {
    return [];
  }
}

async function getUsbDevice(): Promise<string | null> {
  const devices = await getConnectedDevices();
  const usbDevices = devices.filter(
    (device) => classifyAdbSerial(device) === "usb",
  );

  if (usbDevices.length <= 1) return usbDevices[0] ?? null;

  colorLog("yellow", "Multiple USB devices are connected:");
  usbDevices.forEach((device, index) => {
    colorLog("white", `  ${index + 1}. ${device}`);
  });
  const selection = Number(
    await prompt(`Select USB device (1-${usbDevices.length}):`),
  );
  return usbDevices[selection - 1] ?? null;
}

async function detectIpFromUsbDevice(deviceId: string): Promise<string | null> {
  try {
    colorLog(
      "blue",
      `[ADB] Detecting Wi-Fi IP from USB device (${deviceId})...`,
    );

    const procRoute = Bun.spawn(
      ["adb", "-s", deviceId, "shell", "ip", "route"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const outRoute = await new Response(procRoute.stdout).text();
    const routeMatch = outRoute.match(/wlan0.*src\s+([0-9.]+)/);
    if (routeMatch?.[1]) {
      return routeMatch[1];
    }

    const procProp = Bun.spawn(
      ["adb", "-s", deviceId, "shell", "getprop", "dhcp.wlan0.ipaddress"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const outProp = (await new Response(procProp.stdout).text()).trim();
    if (outProp && /^[0-9.]+\.[0-9.]+$/.test(outProp)) {
      return outProp;
    }

    const procAddr = Bun.spawn(
      ["adb", "-s", deviceId, "shell", "ip", "addr", "show", "wlan0"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const outAddr = await new Response(procAddr.stdout).text();
    const addrMatch = outAddr.match(/inet\s+([0-9.]+)/);
    if (addrMatch?.[1]) {
      return addrMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

export interface MdnsService {
  instanceName: string;
  serviceType: string;
  port: number;
  hostname: string;
  ip: string;
}

export interface DiscoveredDevice {
  instanceName: string;
  ip: string;
  hostname: string;
  connectPort: number | undefined;
  pairPort: number | undefined;
}

export type MdnsServiceType = "_adb-tls-connect._tcp" | "_adb-tls-pairing._tcp";

export interface MdnsServiceWaitOptions {
  maxAttempts: number;
  retryIntervalMs: number;
}

const CONNECT_DISCOVERY_WAIT_OPTIONS: MdnsServiceWaitOptions = {
  maxAttempts: 6,
  retryIntervalMs: 500,
};
const PAIRING_DISCOVERY_WAIT_OPTIONS: MdnsServiceWaitOptions = {
  maxAttempts: 10,
  retryIntervalMs: 1_000,
};

export function parseMdnsServices(output: string): MdnsService[] {
  const services: MdnsService[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (
      !trimmed
      || trimmed.startsWith("List of")
      || trimmed.startsWith("Total")
    ) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;

    const instanceName = parts[0];
    const serviceType = parts[1].replace(/\.$/, "");
    const addressPart = parts[parts.length - 1];
    const endpoint = parseIpPort(addressPart);
    if (!endpoint.ip || endpoint.port === undefined) continue;

    const mappedIpv4 = endpoint.ip.match(/::ffff:([0-9.]+)$/i);
    const ip = mappedIpv4?.[1] ?? endpoint.ip;
    const hostname = parts.length >= 4 ? parts[2] : instanceName;

    services.push({
      instanceName,
      serviceType,
      port: endpoint.port,
      hostname,
      ip,
    });
  }

  return services;
}

export function groupMdnsDevices(
  services: readonly MdnsService[],
): DiscoveredDevice[] {
  const grouped = new Map<string, MdnsService[]>();

  for (const service of services) {
    const key = `${service.instanceName}|${service.ip}`;
    const group = grouped.get(key) ?? [];
    group.push(service);
    grouped.set(key, group);
  }

  return [...grouped.values()].map((group) => {
    const first = group[0];
    const connectService = group.find(
      (service) => service.serviceType === "_adb-tls-connect._tcp",
    );
    const pairingService = group.find(
      (service) => service.serviceType === "_adb-tls-pairing._tcp",
    );

    return {
      instanceName: first.instanceName,
      ip: first.ip,
      hostname: first.hostname,
      connectPort: connectService?.port,
      pairPort: pairingService?.port,
    };
  });
}

export function findPairingServiceByPort(
  services: readonly MdnsService[],
  pairingPort: number,
): MdnsService | null {
  return (
    services.find(
      (service) =>
        service.serviceType === "_adb-tls-pairing._tcp"
        && service.port === pairingPort,
    ) ?? null
  );
}

export type PairingServiceResolution =
  | { type: "selected"; service: MdnsService; }
  | { type: "ambiguous"; services: MdnsService[]; }
  | { type: "missing"; };

export function resolvePairingService(
  services: readonly MdnsService[],
): PairingServiceResolution {
  const pairingServices = services.filter(
    (service) => service.serviceType === "_adb-tls-pairing._tcp",
  );

  if (pairingServices.length === 0) return { type: "missing" };
  if (pairingServices.length > 1) {
    return { type: "ambiguous", services: pairingServices };
  }

  const service = pairingServices[0];
  return service ? { type: "selected", service } : { type: "missing" };
}

export type PairingPortProbeResolution =
  | { type: "selected"; device: DiscoveredDevice; }
  | { type: "ambiguous"; devices: DiscoveredDevice[]; }
  | { type: "missing"; };

export async function resolvePairingDeviceByPort(
  devices: readonly DiscoveredDevice[],
  pairingPort: number,
  probePort: (ip: string, port: number) => Promise<boolean>,
): Promise<PairingPortProbeResolution> {
  const devicesByIp = new Map<string, DiscoveredDevice>();
  for (const device of devices) {
    if (device.connectPort !== undefined) {
      devicesByIp.set(device.ip, device);
    }
  }

  const candidates = [...devicesByIp.values()];
  const probes = await Promise.all(
    candidates.map(async (device) => ({
      device,
      isOpen: await probePort(device.ip, pairingPort),
    })),
  );
  const matchingDevices = probes
    .filter((probe) => probe.isOpen)
    .map((probe) => probe.device);

  if (matchingDevices.length === 0) return { type: "missing" };
  if (matchingDevices.length > 1) {
    return { type: "ambiguous", devices: matchingDevices };
  }

  const device = matchingDevices[0];
  return device ? { type: "selected", device } : { type: "missing" };
}

function createPairingService(
  device: DiscoveredDevice,
  pairingPort: number,
): MdnsService {
  return {
    instanceName: device.instanceName,
    serviceType: "_adb-tls-pairing._tcp",
    port: pairingPort,
    hostname: device.hostname,
    ip: device.ip,
  };
}

async function discoverMdnsServices(): Promise<MdnsService[]> {
  try {
    const proc = Bun.spawn(["adb", "mdns", "services"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [output, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (stderr.includes("mDNS is not supported") || !output.trim()) {
      return [];
    }

    return parseMdnsServices(output);
  } catch {
    return [];
  }
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForMdnsService(
  serviceType: MdnsServiceType,
  discoverServices: () => Promise<MdnsService[]>,
  options: MdnsServiceWaitOptions,
  wait: (milliseconds: number) => Promise<void> = pause,
): Promise<MdnsService[]> {
  let latestServices: MdnsService[] = [];

  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    latestServices = await discoverServices();
    if (latestServices.some((service) => service.serviceType === serviceType)) {
      return latestServices;
    }
    if (attempt < options.maxAttempts - 1) {
      await wait(options.retryIntervalMs);
    }
  }

  return latestServices;
}

async function discoverMdnsServicesWithRetry(
  serviceType: MdnsServiceType,
): Promise<MdnsService[]> {
  return waitForMdnsService(
    serviceType,
    discoverMdnsServices,
    CONNECT_DISCOVERY_WAIT_OPTIONS,
  );
}

async function findConnectPortForIp(ip: string): Promise<number | null> {
  const services = await discoverMdnsServicesWithRetry("_adb-tls-connect._tcp");
  for (const s of services) {
    if (s.serviceType === "_adb-tls-connect._tcp" && s.ip === ip) {
      return s.port;
    }
  }
  for (const s of services) {
    if (s.ip === ip && !s.serviceType.includes("pairing")) {
      return s.port;
    }
  }
  return null;
}

async function findConnectServiceForDevice(
  pairingService: MdnsService,
): Promise<MdnsService | null> {
  for (
    let attempt = 0;
    attempt < CONNECT_DISCOVERY_WAIT_OPTIONS.maxAttempts;
    attempt++
  ) {
    const services = await discoverMdnsServices();
    const service = services.find(
      (candidate) =>
        candidate.serviceType === "_adb-tls-connect._tcp"
        && candidate.instanceName === pairingService.instanceName,
    )
      ?? services.find(
        (candidate) =>
          candidate.serviceType === "_adb-tls-connect._tcp"
          && candidate.ip === pairingService.ip,
      );

    if (service) return service;
    if (attempt < CONNECT_DISCOVERY_WAIT_OPTIONS.maxAttempts - 1) {
      await pause(CONNECT_DISCOVERY_WAIT_OPTIONS.retryIntervalMs);
    }
  }

  return null;
}

async function connectViaUsb(): Promise<string | null> {
  const usbDevice = await getUsbDevice();
  if (!usbDevice) return null;

  colorLog("green", `[✓] USB device detected (${usbDevice})`);
  const ip = await detectIpFromUsbDevice(usbDevice);
  if (!ip) {
    colorLog(
      "yellow",
      "[!] Could not detect Wi-Fi IP address from USB device.",
    );
    return null;
  }

  colorLog("green", `[✓] Detected Wi-Fi IP: ${ip}`);
  colorLog("blue", "[ADB] Switching ADB to TCP/IP mode on port 5555...");

  const tcpipProc = Bun.spawn(["adb", "-s", usbDevice, "tcpip", "5555"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await tcpipProc.exited;
  await new Promise<void>((resolve) => setTimeout(resolve, 2000));

  return ip;
}

async function adbConnectOnce(
  target: string,
): Promise<{ ok: boolean; output: string; exitCode: number; }> {
  const proc = Bun.spawn(["adb", "connect", target], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const output = (stdout + (stderr ? "\n" + stderr : "")).trim();
  const ok = output.includes("connected to") || output.includes("already connected to");
  return { ok, output, exitCode };
}

async function adbDisconnectQuiet(target: string): Promise<void> {
  const proc = Bun.spawn(["adb", "disconnect", target], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
}

/** Transport state for a serial: "device", "offline", "unauthorized", ... */
async function getTransportState(target: string): Promise<string> {
  const proc = Bun.spawn(["adb", "-s", target, "get-state"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return (stdout + stderr).trim() || "unknown";
}

type PortRescueResult = { kind: "retried"; ok: boolean; } | { kind: "stale-ad"; } | { kind: "no-ad"; };

/**
 * When an explicit (possibly stale) port fails, re-resolve the live connect
 * port for the same IP via mDNS and retry once.
 *
 * - "retried": a different live port was found and a retry was attempted
 * - "stale-ad": mDNS still advertises the SAME dead port (phone asleep or
 *   Wireless debugging restarted; the advertisement outlived the service)
 * - "no-ad": mDNS no longer advertises a connect service for this IP
 */
async function retryWithDiscoveredPort(
  targetIp: string,
  stalePort: number,
): Promise<PortRescueResult> {
  const freshPort = await findConnectPortForIp(targetIp);
  if (!freshPort) return { kind: "no-ad" };
  if (freshPort === stalePort) return { kind: "stale-ad" };
  colorLog(
    "yellow",
    `[!] Port ${stalePort} is stale; mDNS reports ${freshPort}. Retrying with the live port...`,
  );
  return { kind: "retried", ok: await connectWireless(targetIp) };
}

async function connectWireless(ip: string, port?: number): Promise<boolean> {
  const parsedEndpoint = parseIpPort(ip);
  const targetIp = parsedEndpoint.ip;
  const hasExplicitPort = parsedEndpoint.port !== undefined || port !== undefined;
  const discoveredPort = !hasExplicitPort
    ? await findConnectPortForIp(targetIp)
    : null;
  const actualPort = parsedEndpoint.port ?? port ?? discoveredPort ?? 5555;
  const target = formatIpPort(targetIp, actualPort);

  await isSameSubnet(targetIp);

  const reachable = await pingHost(targetIp);
  if (!reachable) {
    colorLog(
      "yellow",
      `[PING] ${targetIp} did not answer ICMP; checking the ADB port anyway.`,
    );
  }

  const portOpen = await checkPort(targetIp, actualPort);
  if (!portOpen) {
    if (hasExplicitPort) {
      const rescue = await retryWithDiscoveredPort(targetIp, actualPort);
      if (rescue.kind === "retried") return rescue.ok;
      if (rescue.kind === "stale-ad") {
        colorLog(
          "red",
          `[ADB] Port ${actualPort} is closed, but mDNS still advertises it.`,
        );
        colorLog(
          "yellow",
          "       The advertisement is stale: the phone is asleep or Wireless debugging",
        );
        colorLog(
          "yellow",
          "       restarted. Wake the phone / toggle Wireless debugging OFF and ON,",
        );
        colorLog("yellow", "       then rerun: bun run android:wireless");
        return false;
      }
    }
    colorLog("red", `[ADB] Port ${actualPort} is not open on ${targetIp}.`);
    colorLog(
      "yellow",
      "       Reopen the pairing dialog or refresh Wireless debugging.",
    );
    return false;
  }

  colorLog("blue", `[ADB] Connecting to ${target}...`);
  let result = await adbConnectOnce(target);
  if (result.ok) {
    let state = await getTransportState(target);
    if (state !== "device") {
      // "already connected to" can mask a stale offline transport; reset once.
      colorLog(
        "yellow",
        `[!] ${target} reports state "${state}"; resetting the stale transport...`,
      );
      await adbDisconnectQuiet(target);
      result = await adbConnectOnce(target);
      state = await getTransportState(target);
    }
    if (result.ok && state === "device") {
      colorLog("green", `[✓] Successfully connected to ${target}`);
      await saveLastDevice(target);
      return true;
    }
  }

  if (hasExplicitPort) {
    const rescue = await retryWithDiscoveredPort(targetIp, actualPort);
    if (rescue.kind === "retried") return rescue.ok;
  }

  const normalizedOutput = result.output.toLowerCase();
  if (
    normalizedOutput.includes("protocol fault")
    || normalizedOutput.includes("failed to authenticate")
  ) {
    colorLog(
      "yellow",
      "      The endpoint is stale or this computer is not paired with that phone.",
    );
    colorLog("yellow", "      Run: bun run android:wireless --pair");
  }

  colorLog("red", `[✗] ${result.output || `(exit ${result.exitCode})`}`);
  colorLog("yellow", "      Try: bun run android:wireless --discover");
  return false;
}

function showHelp(): void {
  colorLog(
    "cyan",
    "\n══════════════════════════════════════════════════════════",
  );
  colorLog("cyan", "  Android Wireless ADB — Help");
  colorLog(
    "cyan",
    "══════════════════════════════════════════════════════════\n",
  );

  colorLog("bright", "USAGE");
  writeLine("  bun run android:wireless [options] [IP[:port]]\n");

  colorLog("bright", "OPTIONS");
  writeLine("  --help,       -h          Show this help");
  writeLine("  --pair,       -p          Discover and pair a device via mDNS");
  writeLine(
    "  --discover               Scan for wireless ADB devices via mDNS",
  );
  writeLine("  --menu,       -m          Interactive device manager");
  writeLine("  --list,       -l          List connected ADB devices");
  writeLine("  --disconnect, -d [IP]    Disconnect device (all if no IP)");
  writeLine("  --ip <IP[:port]>         Connect to specific IP/port\n");

  colorLog("bright", "FIRST-TIME SETUP (Android 11+)");
  colorLog("yellow", "  Step 1 — Enable Wireless Debugging on phone:");
  colorLog(
    "white",
    "    Settings → Developer Options → Wireless debugging → ON",
  );
  writeLine();
  colorLog("yellow", "  Step 2 — Pair your device (one-time per device):");
  colorLog("white", "    On phone: tap 'Pair device with pairing code'");
  colorLog("white", "    Phone shows: 6-digit code + pairing port");
  colorLog("green", "    Run: bun run android:wireless --pair");
  colorLog(
    "white",
    "    Script matches the displayed port to the discovered phone IP",
  );
  writeLine();
  colorLog("yellow", "  Step 3 — Connect:");
  colorLog("white", "    Run: bun run android:wireless");
  colorLog(
    "white",
    "    Script tries the saved primary endpoint first, then discovers",
  );
  colorLog(
    "white",
    "    via mDNS; stale saved ports are auto-refreshed from mDNS",
  );
  writeLine();

  colorLog("bright", "FIRST-TIME SETUP (Android 10 and below)");
  colorLog("yellow", "  Step 1 — Connect phone via USB cable");
  colorLog("yellow", "  Step 2 — Enable USB debugging in Developer Options");
  colorLog("yellow", "  Step 3 — Run:");
  colorLog("green", "    bun run android:wireless");
  colorLog(
    "white",
    "    Script runs 'adb tcpip 5555' then connects wirelessly",
  );
  colorLog("white", "    Unplug USB after successful connection");
  writeLine();

  colorLog("bright", "EXAMPLES");
  colorLog(
    "white",
    "  bun run android:wireless              # saved endpoint first, then discover",
  );
  colorLog(
    "white",
    "  bun run android:wireless --pair        # pair new device interactively",
  );
  colorLog(
    "white",
    "  bun run android:wireless --discover    # scan for available devices",
  );
  colorLog(
    "white",
    "  bun run android:wireless --ip 192.168.1.5 # connect to specific IP",
  );
  colorLog(
    "white",
    "  bun run android:wireless 192.168.1.5:43567 # connect to specific IP:port",
  );
  colorLog(
    "white",
    "  bun run android:wireless --menu        # interactive manager",
  );
  colorLog(
    "white",
    "  bun run android:wireless --disconnect  # disconnect all wireless",
  );
  writeLine();

  colorLog("bright", "TROUBLESHOOTING");
  colorLog(
    "white",
    "  'Protocol fault'      → stale IP/port; reopen pairing dialog and run --pair",
  );
  colorLog(
    "white",
    "  'No devices found'    → Wireless debugging not enabled on phone",
  );
  colorLog(
    "white",
    "  mDNS not working      → check adb version: needs platform-tools 30+",
  );
  colorLog(
    "white",
    "  Pairing code expired  → code is short-lived, tap 'Pair' again on phone",
  );
  colorLog(
    "white",
    "  Wrong Wi-Fi           → phone and computer must be on same network",
  );
  writeLine();
}

function printDiscoveredDevices(devices: readonly DiscoveredDevice[]): void {
  devices.forEach((device, index) => {
    colorLog("cyan", `  ${index + 1}. ${device.instanceName} (${device.ip})`);
    if (device.connectPort !== undefined) {
      colorLog("green", `     Connect port: ${device.connectPort}`);
    }
    if (device.pairPort !== undefined) {
      colorLog("blue", `     Pairing port: ${device.pairPort}`);
    }
  });
}

function completeWirelessFlow(message: string): void {
  colorLog("green", `\n${message}`);
  colorLog("green", "[✓] Wireless debugging is ready.");
  colorLog("cyan", "Closing wireless connection manager.\n");
  closeRL();
}

async function pairDevice(): Promise<boolean> {
  colorLog(
    "cyan",
    "\n══════════════════════════════════════════════════════════",
  );
  colorLog("cyan", "  Android 11+ Wireless Debugging — Pair Device");
  colorLog(
    "cyan",
    "══════════════════════════════════════════════════════════\n",
  );

  colorLog("white", "On your phone:");
  colorLog("white", "  Settings → Developer Options → Wireless debugging");
  colorLog("white", "  Tap 'Pair device with pairing code'\n");
  colorLog("yellow", "  Phone will show: pairing port + 6-digit code\n");

  colorLog("white", "[1/3] Enter the 6-digit pairing code shown on the phone.");
  const code = await prompt("Enter 6-digit pairing code (shown on phone):");
  if (!/^\d{6}$/.test(code)) {
    colorLog("red", "Invalid code. Must be exactly 6 digits.");
    return false;
  }

  colorLog("blue", "[mDNS] Waiting up to 10 seconds for a pairing endpoint...");

  const services = await waitForMdnsService(
    "_adb-tls-pairing._tcp",
    discoverMdnsServices,
    PAIRING_DISCOVERY_WAIT_OPTIONS,
  );
  const devices = groupMdnsDevices(services);
  if (devices.length > 0) {
    colorLog("green", `Found ${devices.length} wireless device(s):\n`);
    printDiscoveredDevices(devices);
    colorLog("white", "");
  } else {
    colorLog("yellow", "No wireless debugging services were discovered.");
  }

  const resolution = resolvePairingService(services);
  let pairingService: MdnsService | null = null;

  if (resolution.type === "missing") {
    const connectableDevices = devices.filter(
      (device) => device.connectPort !== undefined,
    );
    if (connectableDevices.length === 0) {
      colorLog(
        "red",
        "[✗] No pairing endpoint or connectable wireless device was discovered.",
      );
      colorLog(
        "yellow",
        "    Confirm Wireless debugging is enabled and the phone is on the same Wi-Fi network.",
      );
      return false;
    }

    colorLog(
      "yellow",
      "[mDNS] This phone did not advertise its pairing service. Enter the pairing port shown on the phone to identify it safely.",
    );
    const portInput = await prompt("Enter pairing port (shown on phone):");
    const pairingPort = Number(portInput);
    if (
      !Number.isInteger(pairingPort)
      || pairingPort < 1
      || pairingPort > 65535
    ) {
      colorLog("red", "Invalid port number.");
      return false;
    }

    colorLog(
      "blue",
      `[PORT] Verifying pairing port ${pairingPort} across ${connectableDevices.length} discovered device(s)...`,
    );
    const portResolution = await resolvePairingDeviceByPort(
      connectableDevices,
      pairingPort,
      checkPort,
    );
    if (portResolution.type === "missing") {
      colorLog(
        "red",
        `[✗] Pairing port ${pairingPort} is not reachable on any discovered wireless ADB device.`,
      );
      colorLog(
        "yellow",
        "    Reopen the pairing dialog, confirm the displayed port, and try again.",
      );
      return false;
    }

    let selectedDevice: DiscoveredDevice;
    if (portResolution.type === "selected") {
      selectedDevice = portResolution.device;
    } else {
      colorLog(
        "yellow",
        "The pairing port is reachable on multiple devices. Select the intended phone:",
      );
      printDiscoveredDevices(portResolution.devices);
      const selection = Number(
        await prompt(
          `Select wireless device (1-${portResolution.devices.length}):`,
        ),
      );
      const device = portResolution.devices[selection - 1];
      if (!device) {
        colorLog("red", "Invalid device selection.");
        return false;
      }
      selectedDevice = device;
    }

    pairingService = createPairingService(selectedDevice, pairingPort);
    colorLog(
      "green",
      `[✓] Pairing port ${pairingPort} verified at ${formatIpPort(selectedDevice.ip, pairingPort)}.`,
    );
  } else if (resolution.type === "selected") {
    pairingService = resolution.service;
    colorLog(
      "green",
      `[✓] Automatically selected pairing endpoint ${
        formatIpPort(
          resolution.service.ip,
          resolution.service.port,
        )
      }`,
    );
  } else {
    colorLog(
      "yellow",
      "Multiple pairing endpoints were found; enter the port shown by the intended phone.",
    );

    const portInput = await prompt("Enter pairing port (shown on phone):");
    const pairingPort = Number(portInput);
    if (
      !Number.isInteger(pairingPort)
      || pairingPort < 1
      || pairingPort > 65535
    ) {
      colorLog("red", "Invalid port number.");
      return false;
    }

    pairingService = findPairingServiceByPort(services, pairingPort);
  }

  if (!pairingService) {
    colorLog(
      "red",
      "[✗] That pairing port is not advertised by any discovered device.",
    );
    colorLog(
      "yellow",
      "    Reopen 'Pair device with pairing code' and run --pair again.",
    );
    return false;
  }

  const pairingIp = pairingService.ip;
  const pairingPort = pairingService.port;
  colorLog(
    "green",
    `[2/3] Device discovered: ${pairingService.instanceName} at ${
      formatIpPort(
        pairingIp,
        pairingPort,
      )
    }`,
  );

  const pairingTarget = formatIpPort(pairingIp, pairingPort);
  colorLog("blue", `\n[ADB] Pairing with ${pairingTarget}...`);

  const proc = Bun.spawn(createAdbPairCommand(pairingTarget, code), {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const combined = `${output}\n${stderr}`.trim();

  if (combined.toLowerCase().includes("successfully paired")) {
    colorLog("green", "[2/3] Device paired successfully!\n");
    colorLog("white", "Now discovering connect port via mDNS...");

    const connectService = await findConnectServiceForDevice(pairingService);
    const connectPort = connectService?.port ?? (await findConnectPortForIp(pairingIp));
    const connectIp = connectService?.ip ?? pairingIp;
    if (connectPort !== null) {
      colorLog(
        "green",
        `[✓] Connect endpoint found: ${formatIpPort(connectIp, connectPort)}`,
      );
      const connected = await connectWireless(connectIp, connectPort);
      if (connected) {
        completeWirelessFlow(
          `[3/3] Connected to ${formatIpPort(connectIp, connectPort)}.`,
        );
      }
      return connected;
    }

    colorLog("yellow", "[!] mDNS connect port not found automatically.");
    colorLog("white", "On your phone, note the port shown in the main");
    colorLog("white", "'Wireless debugging' screen (not pairing screen).\n");

    const connectPortInput = await prompt(
      "Enter connect port (shown on phone, or Enter to skip):",
    );
    if (connectPortInput.trim()) {
      const manualPort = parseInt(connectPortInput, 10);
      if (!Number.isNaN(manualPort)) {
        const connected = await connectWireless(pairingIp, manualPort);
        if (connected) {
          completeWirelessFlow(
            `[3/3] Connected to ${formatIpPort(pairingIp, manualPort)}.`,
          );
        }
        return connected;
      }
    }

    colorLog("cyan", `Run manually: adb connect ${pairingIp}:<connect_port>`);
    return false;
  }

  const normalizedOutput = combined.toLowerCase();
  if (normalizedOutput.includes("failed to pair")) {
    colorLog("red", "[✗] Pairing failed. Check code and try again.");
    colorLog(
      "yellow",
      "    Code expires quickly — tap 'Pair device with pairing code' again for a fresh code.",
    );
  } else if (normalizedOutput.includes("protocol fault")) {
    colorLog("red", `[✗] ${combined}`);
    colorLog(
      "yellow",
      "    The pairing endpoint changed. Reopen the pairing dialog and retry.",
    );
  } else {
    colorLog("red", `[✗] Unexpected response: ${combined.trim()}`);
  }

  return false;
}

async function disconnectDevice(targetIp?: string): Promise<void> {
  try {
    const args = targetIp ? ["disconnect", targetIp] : ["disconnect"];
    const proc = Bun.spawn(["adb", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    colorLog("green", `[✓] Disconnected ${targetIp || "all wireless devices"}`);

    // `adb disconnect` can leave stale/offline wireless transports behind
    // (including mDNS auto-connects). Sweep whatever still looks wireless.
    if (!targetIp) {
      await pause(1000);
      const isWireless = (serial: string) => {
        const kind = classifyAdbSerial(serial);
        return kind === "wireless-ip" || kind === "wireless-mdns";
      };
      const leftovers = (await getAdbTransports()).filter((t) => isWireless(t.serial));
      for (const leftover of leftovers) {
        colorLog(
          "yellow",
          `[ADB] Removing leftover transport ${leftover.serial} (${leftover.state})`,
        );
        await adbDisconnectQuiet(leftover.serial);
      }

      const remaining = (await getAdbTransports()).filter((t) => isWireless(t.serial));
      if (remaining.length > 0) {
        colorLog(
          "yellow",
          "[!] The adb server re-added these via mDNS auto-connect:",
        );
        remaining.forEach((t) => colorLog("yellow", `    ${t.serial} (${t.state})`));
        colorLog(
          "white",
          "    The phone is still advertising Wireless debugging.",
        );
        colorLog(
          "white",
          "    Toggle Wireless debugging OFF on the phone to stop the re-connects,",
        );
        colorLog("white", "    or run: adb kill-server");
      }
    }
  } catch (error) {
    colorLog("red", `Failed to disconnect: ${error}`);
  }
}

async function showDiscoverMenu(): Promise<boolean> {
  colorLog("cyan", "Scanning for wireless ADB devices via mDNS...\n");

  const services = await discoverMdnsServices();
  if (services.length === 0) {
    colorLog("yellow", "No wireless ADB devices found via mDNS.");
    colorLog("white", "\nPossible reasons:");
    colorLog("white", "  - No device with Wireless debugging enabled");
    colorLog("white", "  - Device not on same Wi-Fi network");
    colorLog("white", "  - ADB version too old (need platform-tools 30+)");
    colorLog("white", "  - Router has client/AP isolation enabled");
    colorLog(
      "white",
      "\nTo enable: Developer Options → Wireless debugging → ON",
    );
    return false;
  }

  colorLog("green", `Found ${services.length} service(s):\n`);

  const deviceList = groupMdnsDevices(services);
  printDiscoveredDevices(deviceList);

  writeLine();
  colorLog("white", "Commands:");
  colorLog("white", "  adb connect <ip>:<port>    — connect to device");
  colorLog(
    "white",
    "  adb pair <ip>:<port>       — pair with device (get code from phone)",
  );
  colorLog("white", "  bun run android:wireless --ip <ip>:<port>");
  writeLine();

  if (deviceList.length === 0) return false;

  const input = await prompt(
    `Connect to device (1-${deviceList.length}) or Enter to skip:`,
  );
  const selection = parseInt(input, 10);

  if (
    Number.isNaN(selection)
    || selection < 1
    || selection > deviceList.length
  ) {
    return false;
  }

  const selected = deviceList[selection - 1];
  if (!selected) return false;

  if (selected.connectPort !== undefined) {
    const connected = await connectWireless(selected.ip, selected.connectPort);
    if (connected) {
      completeWirelessFlow(
        `[✓] Connected to ${formatIpPort(selected.ip, selected.connectPort)}.`,
      );
    }
    return connected;
  } else if (selected.pairPort !== undefined) {
    colorLog("yellow", `[!] ${selected.instanceName} must be paired first.`);
    return pairDevice();
  } else {
    colorLog(
      "yellow",
      `[!] No usable pairing or connect service found for ${selected.ip}.`,
    );
    return false;
  }
}

async function selectDiscoveredConnectTarget(): Promise<string | null> {
  const services = await discoverMdnsServicesWithRetry("_adb-tls-connect._tcp");
  const devices = groupMdnsDevices(services).filter(
    (device) => device.connectPort !== undefined,
  );

  if (devices.length === 0) return null;

  colorLog("green", `Discovered ${devices.length} connectable device(s):\n`);
  printDiscoveredDevices(devices);
  colorLog("white", "");

  if (devices.length === 1) {
    const device = devices[0];
    if (!device || device.connectPort === undefined) return null;
    return formatIpPort(device.ip, device.connectPort);
  }

  const selection = Number(
    await prompt(`Select wireless device (1-${devices.length}):`),
  );
  const device = devices[selection - 1];
  if (!device || device.connectPort === undefined) {
    colorLog("red", "Invalid device selection.");
    return null;
  }

  return formatIpPort(device.ip, device.connectPort);
}

async function showMenu(): Promise<void> {
  let running = true;

  while (running) {
    const connectedDevices = await getConnectedDevices();

    writeLine(
      "\n"
        + colors.bright
        + colors.cyan
        + "════════════════════════════════════════",
    );
    writeLine("  Android Wireless Device Connector");
    writeLine("════════════════════════════════════════" + colors.reset + "\n");

    if (connectedDevices.length > 0) {
      colorLog(
        "green",
        `Currently connected devices (${connectedDevices.length}):\n`,
      );
      for (let i = 0; i < connectedDevices.length; i++) {
        const deviceId = connectedDevices[i];
        const transport = classifyAdbSerial(deviceId);
        const type = transport === "usb"
          ? "[USB]"
          : transport === "emulator"
          ? "[Emulator]"
          : "[Wireless]";
        colorLog("white", `  ${i + 1}. ${deviceId} ${type}`);
      }
      writeLine();
    }

    const lastIp = await getLastDevice();
    if (lastIp) {
      colorLog("blue", `Primary IP (${LAST_DEVICE_FILE}): ${lastIp}\n`);
    }

    writeLine("Options:");
    writeLine("  1. Connect to primary IP / specified IP");
    writeLine("  2. Auto-detect Wi-Fi IP from USB device");
    writeLine("  3. Pair new device (Android 11+ Wireless Debugging)");
    writeLine("  4. Disconnect all wireless devices");
    writeLine("  5. Refresh device list");
    writeLine("  6. Start Chorus on the connected Android device");
    writeLine("  7. Discover wireless ADB devices (mDNS)");
    writeLine("  8. Exit\n");

    const choice = await prompt("Select an option (1-8):");

    switch (choice) {
      case "1": {
        const inputIp = await prompt(
          `Enter IP [Press Enter for ${lastIp || "none"}]:`,
        );
        const targetIp = inputIp || lastIp;
        if (targetIp) {
          const { ip, port } = parseIpPort(targetIp);
          const connected = await connectWireless(ip, port);
          if (connected) {
            completeWirelessFlow("[✓] Device connection completed.");
            running = false;
          }
        } else {
          colorLog("red", "No IP specified or cached.");
        }
        break;
      }
      case "2": {
        const ip = await connectViaUsb();
        if (ip) {
          const connected = await connectWireless(ip);
          if (connected) {
            completeWirelessFlow("[✓] Device connection completed.");
            running = false;
          }
        } else {
          colorLog(
            "yellow",
            "Ensure device is connected via USB with Wi-Fi enabled.",
          );
        }
        break;
      }
      case "3": {
        const ready = await pairDevice();
        if (ready) running = false;
        break;
      }
      case "4": {
        await disconnectDevice();
        break;
      }
      case "5": {
        colorLog("green", "Refreshing device list...");
        break;
      }
      case "6": {
        colorLog("cyan", "Starting Chorus Android development...");
        const proc = Bun.spawn(createAndroidDevCommand(), {
          stdout: "inherit",
          stderr: "inherit",
        });
        await proc.exited;
        break;
      }
      case "7": {
        const ready = await showDiscoverMenu();
        if (ready) running = false;
        break;
      }
      case "8": {
        running = false;
        colorLog("cyan", "Goodbye!");
        closeRL();
        break;
      }
      default:
        colorLog("red", "Invalid option. Please select 1-8.");
    }
  }
}

async function listDevices(): Promise<void> {
  const devices = await getConnectedDevices();

  colorLog(
    "cyan",
    "\n══════════════════════════════════════════════════════════",
  );
  colorLog("cyan", "  Connected ADB Devices");
  colorLog(
    "cyan",
    "══════════════════════════════════════════════════════════\n",
  );

  if (devices.length === 0) {
    colorLog("yellow", "  No devices connected.");
    colorLog(
      "white",
      "  Run: bun run android:wireless --pair   to pair a new device",
    );
    colorLog(
      "white",
      "  Run: bun run android:wireless          to connect a known device\n",
    );
    return;
  }

  colorLog("white", `  Total: ${devices.length} device(s)\n`);

  for (let i = 0; i < devices.length; i++) {
    const id = devices[i];
    const num = `${i + 1}.`;

    const isMdns = id.includes("._tcp");
    const isWirelessIp = !isMdns && id.includes(":");

    if (isMdns) {
      const serialMatch = id.match(/^adb-([a-f0-9]+)-/i);
      const serial = serialMatch ? serialMatch[1] : "unknown";
      colorLog("green", `  ${num} [Wireless / mDNS]`);
      colorLog("white", `     ID:     ${id}`);
      colorLog("white", `     Serial: ${serial}`);
    } else if (isWirelessIp) {
      const { ip, port } = parseIpPort(id);
      colorLog("green", `  ${num} [Wireless / IP]`);
      colorLog("white", `     Address: ${ip}`);
      colorLog("white", `     Port:    ${port ?? "unknown"}`);
    } else {
      colorLog("blue", `  ${num} [USB]`);
      colorLog("white", `     ID: ${id}`);
    }

    writeLine();
  }
}

async function finishConnectFlow(target: string): Promise<boolean> {
  const { ip, port } = parseIpPort(target);
  const success = await connectWireless(ip, port);
  if (success) {
    const devices = await getConnectedDevices();
    colorLog("cyan", "Active devices:");
    devices.forEach((device) => writeLine(`  • ${device}`));
    completeWirelessFlow("[✓] Device connection completed.");
  }
  return success;
}

async function main(): Promise<void> {
  const hasADB = await checkADB();
  if (!hasADB) {
    colorLog("red", "✗ ADB not found. Please install Android platform-tools.");
    process.exit(1);
  }

  const startServerProc = Bun.spawn(["adb", "start-server"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await startServerProc.exited;

  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    return;
  }

  if (
    args.includes("--menu")
    || args.includes("-m")
    || args.includes("--interactive")
  ) {
    await showMenu();
    return;
  }

  if (args.includes("--discover")) {
    await showDiscoverMenu();
    closeRL();
    return;
  }

  if (args.includes("--pair") || args.includes("-p")) {
    const pairFlagIdx = args.findIndex(
      (a: string) => a === "--pair" || a === "-p",
    );
    const pairIpArg = args
      .slice(pairFlagIdx + 1)
      .find((a: string) => !a.startsWith("-"));
    if (pairIpArg) {
      colorLog(
        "yellow",
        "[!] Ignoring the explicit IP; mDNS selects the live pairing endpoint.",
      );
    }
    const paired = await pairDevice();
    if (!paired) process.exitCode = 1;
    closeRL();
    return;
  }

  if (args.includes("--disconnect") || args.includes("-d")) {
    const disconnectFlagIdx = args.findIndex(
      (a: string) => a === "--disconnect" || a === "-d",
    );
    const ipArg = args
      .slice(disconnectFlagIdx + 1)
      .find((a: string) => !a.startsWith("-"));
    await disconnectDevice(ipArg);
    return;
  }

  if (args.includes("--list") || args.includes("-l")) {
    await listDevices();
    return;
  }

  const ipFlagIdx = args.indexOf("--ip");
  let targetIp: string | undefined = ipFlagIdx !== -1 && ipFlagIdx + 1 < args.length
    ? args[ipFlagIdx + 1]
    : args.find((a: string) => !a.startsWith("-"));

  if (!targetIp) {
    const lastDevice = await getLastDevice();
    if (lastDevice) {
      colorLog(
        "blue",
        `[ADB] Primary endpoint (.last-wireless-device): ${lastDevice}`,
      );
      if (await finishConnectFlow(lastDevice)) return;
      colorLog(
        "yellow",
        "[!] Primary endpoint failed; falling back to mDNS discovery...",
      );
    }
  }

  if (!targetIp) {
    colorLog("blue", "[mDNS] Discovering wireless debugging devices...");
    targetIp = (await selectDiscoveredConnectTarget()) ?? undefined;
  }

  if (!targetIp) {
    const usbIp = await connectViaUsb();
    if (usbIp) targetIp = usbIp;
  }

  if (!targetIp) {
    colorLog(
      "yellow",
      "[!] No wireless debugging service or USB device found.",
    );
    colorLog(
      "cyan",
      "Usage: bun run android:wireless --ip <IP>  OR  bun run android:wireless <IP>  OR  bun run android:wireless --menu",
    );
    colorLog(
      "cyan",
      "Try: bun run android:wireless --discover  to find available devices",
    );
    process.exit(1);
  }

  if (!(await finishConnectFlow(targetIp))) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    colorLog("red", `Error: ${error}`);
    process.exit(1);
  });
}
