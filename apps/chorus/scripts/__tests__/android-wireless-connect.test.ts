import { describe, expect, test } from "bun:test";

import {
  classifyAdbSerial,
  createAdbPairCommand,
  createAndroidDevCommand,
  findPairingServiceByPort,
  groupMdnsDevices,
  parseIpPort,
  parseMdnsServices,
  resolvePairingDeviceByPort,
  resolvePairingService,
  waitForMdnsService,
} from "../android-wireless-connect";

const MDNS_OUTPUT = `List of discovered mdns services
adb-422f9dcd-FqzKkd\t_adb-tls-pairing._tcp\t192.168.29.168:37327
adb-422f9dcd-FqzKkd\t_adb-tls-connect._tcp\t192.168.29.168:39937
adb-R58M-device\t_adb-tls-pairing._tcp.\t192.168.29.44:45111
`;

describe("parseIpPort", () => {
  test("parses IPv4 endpoints", () => {
    expect(parseIpPort("192.168.29.168:39937")).toEqual({
      ip: "192.168.29.168",
      port: 39937,
    });
  });

  test("parses bracketed IPv6 endpoints", () => {
    expect(parseIpPort("[fe80::1234]:39937")).toEqual({
      ip: "fe80::1234",
      port: 39937,
    });
  });
});

describe("createAdbPairCommand", () => {
  test("passes the pairing code as the documented positional argument", () => {
    expect(createAdbPairCommand("192.168.29.168:39451", "685479")).toEqual([
      "adb",
      "pair",
      "192.168.29.168:39451",
      "685479",
    ]);
  });
});

describe("createAndroidDevCommand", () => {
  test("starts the Chorus Tauri Android wireless workflow", () => {
    expect(createAndroidDevCommand()).toEqual([
      "bun",
      "run",
      "android:wireless:start",
    ]);
  });
});

describe("classifyAdbSerial", () => {
  test("does not classify mDNS devices as USB", () => {
    expect(classifyAdbSerial("adb-422f9dcd-FqzKkd._adb-tls-connect._tcp")).toBe(
      "wireless-mdns",
    );
    expect(classifyAdbSerial("192.168.29.168:39937")).toBe("wireless-ip");
    expect(classifyAdbSerial("emulator-5554")).toBe("emulator");
    expect(classifyAdbSerial("R58M123456A")).toBe("usb");
  });
});

describe("mDNS discovery", () => {
  test("groups pairing and connect ports by advertised device identity", () => {
    const devices = groupMdnsDevices(parseMdnsServices(MDNS_OUTPUT));

    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({
      instanceName: "adb-422f9dcd-FqzKkd",
      ip: "192.168.29.168",
      pairPort: 37327,
      connectPort: 39937,
    });
  });

  test("matches the entered pairing port to the discovered dynamic IP", () => {
    const service = findPairingServiceByPort(
      parseMdnsServices(MDNS_OUTPUT),
      45111,
    );

    expect(service).toMatchObject({
      instanceName: "adb-R58M-device",
      ip: "192.168.29.44",
      port: 45111,
    });
  });

  test("does not fall back to an unrelated stale IP", () => {
    const service = findPairingServiceByPort(
      parseMdnsServices(MDNS_OUTPUT),
      39397,
    );

    expect(service).toBeNull();
  });

  test("automatically selects one advertised pairing endpoint", () => {
    const services = parseMdnsServices(MDNS_OUTPUT).filter(
      (service) => service.instanceName === "adb-R58M-device",
    );

    expect(resolvePairingService(services)).toMatchObject({
      type: "selected",
      service: {
        ip: "192.168.29.44",
        port: 45111,
      },
    });
  });

  test("requires disambiguation when multiple pairing endpoints exist", () => {
    expect(resolvePairingService(parseMdnsServices(MDNS_OUTPUT))).toMatchObject(
      {
        type: "ambiguous",
      },
    );
  });

  test("waits until a pairing endpoint is advertised", async () => {
    const snapshots = [
      parseMdnsServices(
        "adb-ZA223326H5-tgNc6F\\t_adb-tls-connect._tcp\\t192.168.29.125:35037",
      ),
      [],
      parseMdnsServices(MDNS_OUTPUT),
    ];
    let discoveryCalls = 0;
    let waitCalls = 0;

    const services = await waitForMdnsService(
      "_adb-tls-pairing._tcp",
      async () => {
        const snapshot = snapshots[discoveryCalls] ?? [];
        discoveryCalls += 1;
        return snapshot;
      },
      { maxAttempts: 3, retryIntervalMs: 1 },
      async () => {
        waitCalls += 1;
      },
    );

    expect(discoveryCalls).toBe(3);
    expect(waitCalls).toBe(2);
    expect(resolvePairingService(services).type).toBe("ambiguous");
  });

  test("does not return a connect-only device as a pairing endpoint", async () => {
    const connectOnlyServices = parseMdnsServices(
      "adb-ZA223326H5-tgNc6F\\t_adb-tls-connect._tcp\\t192.168.29.125:35037",
    );

    const services = await waitForMdnsService(
      "_adb-tls-pairing._tcp",
      async () => connectOnlyServices,
      { maxAttempts: 2, retryIntervalMs: 1 },
      async () => undefined,
    );

    expect(resolvePairingService(services)).toEqual({ type: "missing" });
  });

  test("matches a manually displayed pairing port to one discovered host", async () => {
    const devices = groupMdnsDevices(
      parseMdnsServices(`
        adb-422f9dcd-FqzKkd\t_adb-tls-connect._tcp\t192.168.29.168:39937
        adb-ZA223326H5-tgNc6F\t_adb-tls-connect._tcp\t192.168.29.125:35037
      `),
    );
    const probedIps: string[] = [];

    const result = await resolvePairingDeviceByPort(
      devices,
      43493,
      async (ip) => {
        probedIps.push(ip);
        return ip === "192.168.29.168";
      },
    );

    expect(probedIps).toEqual(["192.168.29.168", "192.168.29.125"]);
    expect(result).toMatchObject({
      type: "selected",
      device: { ip: "192.168.29.168" },
    });
  });

  test("does not select a host when the pairing port is closed everywhere", async () => {
    const devices = groupMdnsDevices(
      parseMdnsServices(
        "adb-422f9dcd-FqzKkd\t_adb-tls-connect._tcp\t192.168.29.168:39937",
      ),
    );

    const result = await resolvePairingDeviceByPort(
      devices,
      43493,
      async () => false,
    );

    expect(result).toEqual({ type: "missing" });
  });

  test("requires a selection when the pairing port is reachable on multiple hosts", async () => {
    const devices = groupMdnsDevices(
      parseMdnsServices(`
        adb-422f9dcd-FqzKkd\t_adb-tls-connect._tcp\t192.168.29.168:39937
        adb-ZA223326H5-tgNc6F\t_adb-tls-connect._tcp\t192.168.29.125:35037
      `),
    );

    const result = await resolvePairingDeviceByPort(
      devices,
      43493,
      async () => true,
    );

    expect(result).toMatchObject({
      type: "ambiguous",
      devices: [{ ip: "192.168.29.168" }, { ip: "192.168.29.125" }],
    });
  });
});
