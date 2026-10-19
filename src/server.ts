import {
  BadRequestException,
  Controller,
  type DynamicModule,
  Get,
  Injectable,
  Module,
  type OnModuleInit,
  Query,
} from "@nestjs/common";
import type {
  PluginApartment,
  PluginHost,
  PluginModuleFactory,
  PluginResident,
  PluginSettingsValues,
} from "@openbrf/plugin-sdk";
import { z } from "zod";

/**
 * The plugin's server entry point.
 *
 * A plugin's backend is an ordinary NestJS module: a provider, a controller and
 * a lifecycle hook, written as they would be in any NestJS application. The
 * host mounts the controller under `/api/plugin/occupancy/`, inside the
 * application's own authorization guard, and raises every route to the
 * capability that reading the register requires, so neither route here names
 * a capability of its own.
 *
 * Three rules shape this file, and each comes from the plugin contract:
 *
 * - It is the whole server. The host requires one CommonJS bundle that
 *   requires nothing but the host's packages and Node's built-in modules, so a
 *   helper in a second source file would be a relative require the package
 *   check refuses. The view imports the response types below, which the
 *   compiler erases.
 * - `@openbrf/plugin-sdk` is imported for types only. It is a build-time
 *   dependency and cannot be resolved from an installed plugin's directory;
 *   everything the plugin uses at runtime arrives on the host object.
 * - NestJS and zod are imported for values and resolve to the host's own
 *   copies, which the host puts on the module path. Both are peer
 *   dependencies and are never bundled: a second NestJS is a second,
 *   disconnected container, and a schema built with a second zod is refused.
 */

/** How the apartment list is grouped. The values of the `grouping` setting. */
export const GROUPINGS = ["address", "floor"] as const;
export type Grouping = (typeof GROUPINGS)[number];

/** The plugin's settings, narrowed from what the host stores. */
export interface OccupancySettings {
  /** Empty means the view's own translated title. */
  heading: string;
  showMembers: boolean;
  grouping: Grouping;
  rowLimit: number;
}

/** What `GET /api/plugin/occupancy/summary` answers. */
export interface SummaryResponse {
  heading: string;
  showMembers: boolean;
  apartments: number;
  residents: number;
  /** Null when the board has chosen not to show it. */
  members: number | null;
}

/**
 * One apartment as the list shows it: who lives there, counted, and never
 * named. The plugin reads names from the register to count people, and the
 * names stop here; the browser receives numbers.
 */
export interface ApartmentRow {
  id: string;
  /** Street and number, because an apartment number is only unique per address. */
  address: string;
  number: string;
  floor: number | null;
  /** Distinct people whose residency on the apartment is in force. */
  residents: number;
  /** Those of them holding the tenant-ownership. */
  tenantOwners: number;
}

/** A heading in the list and the apartments under it. */
export type ApartmentGroup =
  | {
      kind: "address";
      key: string;
      street: string;
      number: string;
      apartments: ApartmentRow[];
    }
  | {
      kind: "floor";
      key: string;
      floor: number | null;
      apartments: ApartmentRow[];
    };

/** What `GET /api/plugin/occupancy/apartments` answers. */
export interface ApartmentsResponse {
  grouping: Grouping;
  /** Every apartment in the register. */
  total: number;
  /**
   * Apartments with no resident the plugin was given. The host leaves out
   * people with protected personal data and people whose processing is
   * restricted, so this is not a count of empty apartments.
   */
  withoutResidents: number;
  /** How many of the apartments the groups hold, at most `rowLimit`. */
  shown: number;
  groups: ApartmentGroup[];
}

/**
 * The manifest's defaults, for a value the host did not supply.
 *
 * The host applies the declared defaults before it hands the values over, so
 * these only matter for a stored row written before a field existed. They
 * repeat the manifest on purpose: a plugin falling back to a different value
 * would behave one way on a fresh install and another after an upgrade.
 */
const DEFAULTS: OccupancySettings = {
  heading: "",
  showMembers: true,
  grouping: "address",
  rowLimit: 100,
};

/** Reads the settings the host stored into the shape this plugin uses. */
export function readSettings(values: PluginSettingsValues): OccupancySettings {
  const { heading, showMembers, grouping, rowLimit } = values;
  return {
    heading: typeof heading === "string" ? heading.trim() : DEFAULTS.heading,
    showMembers:
      typeof showMembers === "boolean" ? showMembers : DEFAULTS.showMembers,
    grouping: isGrouping(grouping) ? grouping : DEFAULTS.grouping,
    rowLimit:
      typeof rowLimit === "number" && Number.isInteger(rowLimit) && rowLimit > 0
        ? rowLimit
        : DEFAULTS.rowLimit,
  };
}

function isGrouping(value: unknown): value is Grouping {
  return (GROUPINGS as readonly unknown[]).includes(value);
}

const collator = new Intl.Collator("sv", { numeric: true });

function compareApartments(a: PluginApartment, b: PluginApartment): number {
  return (
    collator.compare(a.address.street, b.address.street) ||
    collator.compare(a.address.number, b.address.number) ||
    collator.compare(a.number, b.number)
  );
}

/** Floors in order, with an apartment whose floor is not recorded last. */
function compareFloors(a: number | null, b: number | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a - b;
}

/**
 * Counts each apartment's residents and groups the list.
 *
 * Pure, so the tests can hold it to the register's edge cases without a host:
 * a person listed twice on one apartment is one resident, and a residency with
 * no apartment counts nowhere.
 */
export function listApartments(
  apartments: readonly PluginApartment[],
  residents: readonly PluginResident[],
  settings: Pick<OccupancySettings, "grouping" | "rowLimit">,
): ApartmentsResponse {
  const living = new Map<string, Set<string>>();
  const holding = new Map<string, Set<string>>();
  for (const resident of residents) {
    const apartmentId = resident.apartment?.id;
    if (apartmentId === undefined) {
      continue;
    }
    addTo(living, apartmentId, resident.personId);
    if (resident.role === "MEMBER") {
      addTo(holding, apartmentId, resident.personId);
    }
  }

  // Sorted in the order the list shows them, so `rowLimit` cuts it where a
  // reader would expect: by floor, and then by address, for the floor grouping.
  const order =
    settings.grouping === "floor"
      ? (a: PluginApartment, b: PluginApartment) =>
          compareFloors(a.floor, b.floor) || compareApartments(a, b)
      : compareApartments;
  const rows = [...apartments].sort(order).map((apartment) => ({
    apartment,
    row: {
      id: apartment.id,
      address: `${apartment.address.street} ${apartment.address.number}`,
      number: apartment.number,
      floor: apartment.floor,
      residents: living.get(apartment.id)?.size ?? 0,
      tenantOwners: holding.get(apartment.id)?.size ?? 0,
    } satisfies ApartmentRow,
  }));
  const shown = rows.slice(0, settings.rowLimit);

  const groups = new Map<string, ApartmentGroup>();
  for (const { apartment, row } of shown) {
    const group =
      settings.grouping === "address"
        ? groupFor(groups, `address:${apartment.address.id}`, (key) => ({
            kind: "address",
            key,
            street: apartment.address.street,
            number: apartment.address.number,
            apartments: [],
          }))
        : groupFor(
            groups,
            `floor:${String(apartment.floor ?? "none")}`,
            (key) => ({
              kind: "floor",
              key,
              floor: apartment.floor,
              apartments: [],
            }),
          );
    group.apartments.push(row);
  }

  return {
    grouping: settings.grouping,
    total: rows.length,
    withoutResidents: rows.filter(({ row }) => row.residents === 0).length,
    shown: shown.length,
    groups: [...groups.values()],
  };
}

function addTo(
  map: Map<string, Set<string>>,
  key: string,
  value: string,
): void {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

function groupFor(
  groups: Map<string, ApartmentGroup>,
  key: string,
  create: (key: string) => ApartmentGroup,
): ApartmentGroup {
  const existing = groups.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const group = create(key);
  groups.set(key, group);
  return group;
}

/**
 * The one query parameter the list takes, read with the host's zod.
 *
 * A route's input is the plugin's to check: the host authorizes the request,
 * and what the request carries is still whatever the caller sent. A
 * `BadRequestException` is answered as the 400 it is; anything else a handler
 * throws is answered as a bad gateway and logged with the plugin's id.
 */
const apartmentsQuery = z.strictObject({
  grouping: z.enum(GROUPINGS).optional(),
});

/**
 * Builds the plugin's module.
 *
 * Named `createPlugin` because that is the export the host looks for. The
 * classes are declared inside it so that each closes over the host object this
 * plugin was given, which carries its id and the permissions the board
 * consented to.
 */
export const createPlugin: PluginModuleFactory = (
  host: PluginHost,
): DynamicModule => {
  @Injectable()
  class OccupancyService implements OnModuleInit {
    /**
     * Start-up work belongs here rather than in the constructor.
     *
     * The host object is late-bound: the application behind it is built after
     * this factory has run, so its services answer from `onModuleInit`
     * onwards, and a call made earlier throws `PluginHostUnavailableError`.
     */
    async onModuleInit(): Promise<void> {
      const settings = readSettings(await host.settings.read());
      host.logger.info(
        `Ready, listing at most ${String(settings.rowLimit)} apartments grouped by ${settings.grouping}.`,
      );
    }

    /**
     * Read on every request rather than once: the host reads the stored
     * values on each call, so a change the board saves applies at once.
     */
    async settings(): Promise<OccupancySettings> {
      return readSettings(await host.settings.read());
    }

    async summary(): Promise<SummaryResponse> {
      const [settings, counts] = await Promise.all([
        this.settings(),
        host.addressBook.summary(),
      ]);
      return {
        heading: settings.heading,
        showMembers: settings.showMembers,
        apartments: counts.apartments,
        residents: counts.residents,
        members: settings.showMembers ? counts.members : null,
      };
    }

    async apartments(
      grouping: Grouping | undefined,
    ): Promise<ApartmentsResponse> {
      const [settings, apartments, residents] = await Promise.all([
        this.settings(),
        host.addressBook.apartments(),
        host.addressBook.residents(),
      ]);
      return listApartments(apartments, residents, {
        grouping: grouping ?? settings.grouping,
        rowLimit: settings.rowLimit,
      });
    }
  }

  /** No path of its own: the host mounts it under the plugin's prefix. */
  @Controller()
  class OccupancyController {
    constructor(private readonly service: OccupancyService) {}

    @Get("summary")
    summary(): Promise<SummaryResponse> {
      return this.service.summary();
    }

    @Get("apartments")
    async apartments(@Query() query: unknown): Promise<ApartmentsResponse> {
      const parsed = apartmentsQuery.safeParse(query);
      if (!parsed.success) {
        throw new BadRequestException(
          "The only parameter is grouping, which is address or floor.",
        );
      }
      return this.service.apartments(parsed.data.grouping);
    }
  }

  /*
   * The action this plugin proposes: the association's counts, which name
   * nobody.
   *
   * The manifest declares it - its capability, its effect, the personal data
   * it touches and the surfaces it may be offered on - because the board reads
   * that on the consent screen before any of this code is downloaded. This
   * registers the matching definition. It is registered from the factory, which
   * the host allows for this call alone and buffers until the application
   * exists. Declaring it offers it to nobody outside the instance: an
   * administrator arms it on the plugin's own screen.
   *
   * `host.actions` arrived after the first hosts of this contract version
   * shipped, and nothing refuses a plugin on an older host, so the plugin
   * checks for it and does without.
   */
  if (host.actions !== undefined) {
    host.actions.register({
      id: "summary",
      definition: {
        name: "summary",
        titleKey: "actions.summary.title",
        descriptionKey: "actions.summary.description",
        group: "occupancy",
        groupTitleKey: "actions.group.occupancy.title",
        idempotent: true,
        additive: false,
        needsConfirmation: false,
        openWorld: false,
        errors: [],
        input: z.strictObject({}).describe("Takes no arguments."),
        output: z
          .strictObject({
            apartments: z
              .number()
              .int()
              .describe("How many apartments the association has."),
            residents: z
              .number()
              .int()
              .describe("How many people are registered as living in them."),
            members: z
              .number()
              .int()
              .describe("How many people hold a tenant-ownership."),
          })
          .describe("Counts, and never a person."),
        handler: async () => {
          const { apartments, residents, members } =
            await host.addressBook.summary();
          return { apartments, residents, members };
        },
      },
    });
  }

  @Module({})
  class OccupancyModule {}

  return {
    module: OccupancyModule,
    controllers: [OccupancyController],
    providers: [OccupancyService],
  };
};
