import type {
  PluginActionRegistration,
  PluginApartment,
  PluginHost,
  PluginResident,
  PluginSettingsValues,
} from "@openbrf/plugin-sdk";

/**
 * A host object for the tests, holding a small register.
 *
 * Only the members this plugin uses do anything; the rest throw, the way an
 * instance's do for a service the manifest did not ask for.
 */

const storgatan = { id: "addr-1", street: "Storgatan", number: "12" };
const lillgatan = { id: "addr-2", street: "Lillgatan", number: "3" };

export const APARTMENTS: PluginApartment[] = [
  { id: "apt-1201", number: "1201", floor: 2, address: storgatan },
  { id: "apt-1101", number: "1101", floor: 1, address: storgatan },
  { id: "apt-1102", number: "1102", floor: 1, address: storgatan },
  { id: "apt-1001", number: "1001", floor: null, address: lillgatan },
];

function resident(
  personId: string,
  role: PluginResident["role"],
  apartment: PluginApartment | null,
): PluginResident {
  return {
    personId,
    name: `Person ${personId}`,
    role,
    apartment,
    movedInOn: "2020-01-01",
    movedOutOn: null,
  };
}

export const RESIDENTS: PluginResident[] = [
  resident("p1", "MEMBER", APARTMENTS[1] ?? null),
  resident("p2", "MEMBER", APARTMENTS[1] ?? null),
  resident("p3", "RESIDENT", APARTMENTS[1] ?? null),
  resident("p4", "MEMBER", APARTMENTS[0] ?? null),
  // The same person listed twice on one apartment is still one resident.
  resident("p4", "MEMBER", APARTMENTS[0] ?? null),
  // A residency with no apartment counts towards none of them.
  resident("p5", "RESIDENT", null),
];

export interface FakeHost extends PluginHost {
  registrations: PluginActionRegistration[];
  logged: string[];
  setSettings(values: PluginSettingsValues): void;
}

function refused(name: string): never {
  throw new Error(`The test host does not provide ${name}.`);
}

export function fakeHost(
  options: { settings?: PluginSettingsValues; withActions?: boolean } = {},
): FakeHost {
  let settings: PluginSettingsValues = options.settings ?? {
    heading: "",
    showMembers: true,
    grouping: "address",
    rowLimit: 100,
  };
  const registrations: PluginActionRegistration[] = [];
  const logged: string[] = [];

  const host: FakeHost = {
    id: "occupancy",
    permissions: ["addressBook:read"],
    registrations,
    logged,
    setSettings(values) {
      settings = values;
    },
    logger: {
      debug: (message) => logged.push(message),
      info: (message) => logged.push(message),
      warn: (message) => logged.push(message),
      error: (message) => logged.push(message),
    },
    settings: { read: async () => settings },
    mail: { send: async () => refused("mail") },
    sms: { send: async () => refused("sms") },
    jobs: {
      work: async () => refused("jobs"),
      send: async () => refused("jobs"),
      sendAt: async () => refused("jobs"),
      schedule: async () => refused("jobs"),
    },
    addressBook: {
      apartments: async () => APARTMENTS,
      residents: async () => RESIDENTS,
      summary: async () => ({ apartments: 4, residents: 4, members: 3 }),
    },
    actions: {
      register: (registration) => {
        registrations.push(registration);
      },
      list: async () => refused("actions.list"),
      invoke: async () => refused("actions.invoke"),
    } as PluginHost["actions"],
  };

  if (options.withActions === false) {
    // An instance older than `host.actions`.
    Reflect.deleteProperty(host, "actions");
  }
  return host;
}
