import { describe, expect, it } from "vitest";
import { listApartments, readSettings } from "../src/server";
import { APARTMENTS, RESIDENTS } from "./fake-host";

describe("readSettings", () => {
  it("takes the stored values as they are", () => {
    expect(
      readSettings({
        heading: "Vår förening",
        showMembers: false,
        grouping: "floor",
        rowLimit: 5,
      }),
    ).toEqual({
      heading: "Vår förening",
      showMembers: false,
      grouping: "floor",
      rowLimit: 5,
    });
  });

  it("falls back to the manifest's defaults for what a stored row does not hold", () => {
    expect(readSettings({})).toEqual({
      heading: "",
      showMembers: true,
      grouping: "address",
      rowLimit: 100,
    });
  });

  it("ignores a value of the wrong shape rather than passing it on", () => {
    expect(
      readSettings({
        heading: 3,
        showMembers: "yes",
        grouping: "street",
        rowLimit: 2.5,
      }),
    ).toEqual({
      heading: "",
      showMembers: true,
      grouping: "address",
      rowLimit: 100,
    });
  });

  it("treats a heading of only spaces as no heading", () => {
    expect(readSettings({ heading: "   " }).heading).toBe("");
  });
});

describe("listApartments", () => {
  it("counts each apartment's residents and tenant-owners, never naming one", () => {
    const list = listApartments(APARTMENTS, RESIDENTS, {
      grouping: "address",
      rowLimit: 100,
    });

    expect(list.total).toBe(4);
    expect(list.shown).toBe(4);
    expect(list.withoutResidents).toBe(2);
    expect(list.groups.map((group) => group.key)).toEqual([
      "address:addr-2",
      "address:addr-1",
    ]);

    const storgatan = list.groups[1];
    expect(storgatan).toMatchObject({
      kind: "address",
      street: "Storgatan",
      number: "12",
    });
    expect(storgatan?.apartments).toEqual([
      {
        id: "apt-1101",
        number: "1101",
        floor: 1,
        residents: 3,
        tenantOwners: 2,
      },
      {
        id: "apt-1102",
        number: "1102",
        floor: 1,
        residents: 0,
        tenantOwners: 0,
      },
      {
        id: "apt-1201",
        number: "1201",
        floor: 2,
        residents: 1,
        tenantOwners: 1,
      },
    ]);

    expect(JSON.stringify(list)).not.toContain("Person");
  });

  it("groups by floor in order, with an unrecorded floor last", () => {
    const list = listApartments(APARTMENTS, RESIDENTS, {
      grouping: "floor",
      rowLimit: 100,
    });

    expect(list.groups.map((group) => group.key)).toEqual([
      "floor:1",
      "floor:2",
      "floor:none",
    ]);
    expect(list.groups[2]).toMatchObject({ kind: "floor", floor: null });
  });

  it("cuts the floor grouping at rowLimit in floor order", () => {
    const list = listApartments(APARTMENTS, RESIDENTS, {
      grouping: "floor",
      rowLimit: 3,
    });

    expect(
      list.groups.flatMap((group) => group.apartments.map((row) => row.number)),
    ).toEqual(["1101", "1102", "1201"]);
  });

  it("lists at most rowLimit apartments while counting every one", () => {
    const list = listApartments(APARTMENTS, RESIDENTS, {
      grouping: "address",
      rowLimit: 2,
    });

    expect(list.total).toBe(4);
    expect(list.shown).toBe(2);
    expect(list.withoutResidents).toBe(2);
    expect(
      list.groups.flatMap((group) => group.apartments.map((row) => row.number)),
    ).toEqual(["1001", "1101"]);
  });

  it("answers an empty register with no groups", () => {
    expect(listApartments([], [], { grouping: "floor", rowLimit: 10 })).toEqual(
      {
        grouping: "floor",
        total: 0,
        withoutResidents: 0,
        shown: 0,
        groups: [],
      },
    );
  });
});
