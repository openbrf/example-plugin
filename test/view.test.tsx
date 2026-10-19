// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import en from "../locales/en.json";
import sv from "../locales/sv.json";
import type { ApartmentsResponse, SummaryResponse } from "../src/server";
import View from "../src/View";

/**
 * The view as the host renders it: inside the host's i18next, with the
 * plugin's translations merged under `plugin-occupancy`, and talking to the
 * plugin's own routes on the same origin.
 */

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "sv",
    fallbackLng: "sv",
    ns: ["plugin-occupancy"],
    resources: {
      sv: { "plugin-occupancy": sv },
      en: { "plugin-occupancy": en },
    },
    interpolation: { escapeValue: false },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SUMMARY: SummaryResponse = {
  heading: "",
  showMembers: true,
  apartments: 3,
  residents: 4,
  members: 2,
};

function apartments(grouping: "address" | "floor"): ApartmentsResponse {
  return grouping === "address"
    ? {
        grouping,
        total: 3,
        withoutResidents: 1,
        shown: 2,
        groups: [
          {
            kind: "address",
            key: "address:a1",
            street: "Storgatan",
            number: "12",
            apartments: [
              {
                id: "1",
                number: "1101",
                floor: 1,
                residents: 3,
                tenantOwners: 2,
              },
              {
                id: "2",
                number: "1102",
                floor: 1,
                residents: 0,
                tenantOwners: 0,
              },
            ],
          },
        ],
      }
    : {
        grouping,
        total: 3,
        withoutResidents: 1,
        shown: 3,
        groups: [
          {
            kind: "floor",
            key: "floor:1",
            floor: 1,
            apartments: [
              {
                id: "1",
                number: "1101",
                floor: 1,
                residents: 3,
                tenantOwners: 2,
              },
            ],
          },
          {
            kind: "floor",
            key: "floor:none",
            floor: null,
            apartments: [
              {
                id: "3",
                number: "1001",
                floor: null,
                residents: 1,
                tenantOwners: 1,
              },
            ],
          },
        ],
      };
}

function serve(summary: SummaryResponse | null = SUMMARY) {
  const fetch = vi.fn(async (input: string) => {
    const url = new URL(input, "https://brf.example");
    if (url.pathname === "/api/plugin/occupancy/summary") {
      return summary === null
        ? new Response("", { status: 502 })
        : Response.json(summary);
    }
    if (url.pathname === "/api/plugin/occupancy/apartments") {
      return Response.json(
        apartments(
          url.searchParams.get("grouping") === "floor" ? "floor" : "address",
        ),
      );
    }
    return new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function show() {
  return render(
    <I18nextProvider i18n={i18n}>
      <View />
    </I18nextProvider>,
  );
}

describe("the view", () => {
  it("shows the association's figures under the view's own title", async () => {
    serve();
    show();

    expect(
      await screen.findByRole("heading", { name: "Boende och lägenheter" }),
    ).toBeTruthy();
    expect(screen.getByText("Lägenheter").nextSibling?.textContent).toBe("3");
    expect(screen.getByText("Medlemmar").nextSibling?.textContent).toBe("2");
  });

  it("lists the apartments under their address and marks the ones nobody is registered in", async () => {
    serve();
    show();

    const table = await screen.findByRole("table", { name: "Storgatan 12" });
    const rows = within(table).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "LägenhetBoendeBostadsrättshavare",
      "110132",
      "1102Ingen registrerad0",
    ]);
    expect(
      screen.getByText("1 lägenhet har ingen registrerad som boende."),
    ).toBeTruthy();
    expect(screen.getByText("Visar 2 av 3 lägenheter.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Adress", pressed: true }),
    ).toBeTruthy();
  });

  it("asks for the floor grouping when the person picks it", async () => {
    const fetch = serve();
    show();
    await screen.findByRole("table", { name: "Storgatan 12" });

    fireEvent.click(screen.getByRole("button", { name: "Våning" }));

    expect(await screen.findByRole("table", { name: "Våning 1" })).toBeTruthy();
    expect(
      screen.getByRole("table", { name: "Våning inte angiven" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Våning", pressed: true }),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/plugin/occupancy/apartments?grouping=floor",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("uses the board's heading and leaves members out when the settings say so", async () => {
    serve({
      ...SUMMARY,
      heading: "Brf Exemplet",
      showMembers: false,
      members: null,
    });
    show();

    expect(
      await screen.findByRole("heading", { name: "Brf Exemplet" }),
    ).toBeTruthy();
    expect(screen.queryByText("Medlemmar")).toBeNull();
  });

  it("says so when the figures cannot be loaded", async () => {
    serve(null);
    show();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Uppgifterna kunde inte hämtas.",
    );
  });

  it("speaks English when the person does", async () => {
    serve();
    await i18n.changeLanguage("en");
    try {
      show();
      expect(
        await screen.findByRole("table", { name: "Storgatan 12" }),
      ).toBeTruthy();
      expect(screen.getByText("Nobody registered")).toBeTruthy();
    } finally {
      await i18n.changeLanguage("sv");
    }
  });
});
