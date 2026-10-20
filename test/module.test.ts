import "reflect-metadata";
import { createRequire } from "node:module";
import {
  BadRequestException,
  type DynamicModule,
  type Type,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  actionInputJsonSchema,
  actionOutputJsonSchema,
} from "@openbrf/plugin-sdk";
import { describe, expect, it } from "vitest";
import type * as Server from "../src/server";
import { fakeHost } from "./fake-host";

/**
 * The server bundle as it ships, built into a NestJS application.
 *
 * `dist/server.cjs` rather than the source: what an instance loads is the
 * compiled file, and building it into a real module is what proves the
 * decorator metadata survived the build. Without it NestJS cannot tell what the
 * controller's constructor wants, and the plugin fails at load.
 */
const { createPlugin } = createRequire(import.meta.url)(
  "../dist/server.cjs",
) as typeof Server;

interface Controller {
  summary(): Promise<Server.SummaryResponse>;
  apartments(query: unknown): Promise<Server.ApartmentsResponse>;
}

async function start(host = fakeHost()) {
  const module = createPlugin(host) as DynamicModule;
  const testing = await Test.createTestingModule({
    imports: [module],
  }).compile();
  await testing.init();
  const [controllerClass] = module.controllers ?? [];
  const controller = testing.get<Controller>(
    controllerClass as Type<Controller>,
  );
  return { host, module, testing, controller };
}

describe("the server bundle", () => {
  it("is a dynamic module with one controller and one provider, and nothing global", async () => {
    const { module, testing } = await start();

    expect(module.global).toBeUndefined();
    expect(module.controllers).toHaveLength(1);
    expect(module.providers).toHaveLength(1);
    expect(module.imports).toBeUndefined();
    await testing.close();
  });

  it("reads the host's settings once the module is initialised", async () => {
    const { host, testing } = await start();

    expect(host.logged).toContain(
      "Ready, listing at most 100 apartments grouped by address.",
    );
    await testing.close();
  });

  it("answers the summary, leaving members out when the board says so", async () => {
    const host = fakeHost();
    const { controller, testing } = await start(host);

    expect(await controller.summary()).toEqual({
      heading: "",
      showMembers: true,
      apartments: 4,
      residents: 4,
      members: 3,
    });

    // Read on every request, so a saved change applies without a restart.
    host.setSettings({ heading: "Brf Exemplet", showMembers: false });
    expect(await controller.summary()).toMatchObject({
      heading: "Brf Exemplet",
      showMembers: false,
      members: null,
    });
    await testing.close();
  });

  it("lists the apartments in the board's grouping, or the one asked for", async () => {
    const { controller, testing } = await start(
      fakeHost({ settings: { grouping: "floor" } }),
    );

    expect((await controller.apartments({})).grouping).toBe("floor");
    expect(
      (await controller.apartments({ grouping: "address" })).grouping,
    ).toBe("address");
    await testing.close();
  });

  it("refuses a grouping it does not know, or a parameter it does not take, as a bad request", async () => {
    const { controller, testing } = await start();

    await expect(
      controller.apartments({ grouping: "street" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.apartments({ limit: "5" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await testing.close();
  });

  it("registers the action its manifest declares, with schemas the host can publish", async () => {
    const host = fakeHost();
    createPlugin(host);

    expect(host.registrations.map((registration) => registration.id)).toEqual([
      "summary",
    ]);
    const [summary] = host.registrations;
    const definition = summary?.definition;
    expect(definition?.titleKey).toBe("actions.summary.title");

    const input = definition?.input;
    const output = definition?.output;
    expect(input).toBeDefined();
    expect(output).toBeDefined();
    if (
      input === undefined ||
      output === undefined ||
      definition === undefined
    ) {
      return;
    }
    expect(actionInputJsonSchema(input, "occupancy_summary")).toMatchObject({
      type: "object",
    });
    expect(actionOutputJsonSchema(output, "occupancy_summary")).toMatchObject({
      type: "object",
    });

    const answer = await definition.handler({}, {} as never);
    expect(answer).toEqual({ apartments: 4, residents: 4, members: 3 });
    expect((await output["~standard"].validate(answer)).issues).toBeUndefined();
  });

  it("loads on a host older than host.actions, without the action", async () => {
    const { testing } = await start(fakeHost({ withActions: false }));
    await testing.close();
  });
});
