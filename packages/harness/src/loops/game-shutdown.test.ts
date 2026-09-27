import { expect, jest, test } from "bun:test";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import { createGame } from "#harness/loops/game";
import { sessionNavigation } from "#harness/navigation/travel";
import { native } from "#test-support/navigation-fixtures";

function tracked(order: string[]) {
  const handle = createMockHandle();
  handle.logout = jest.fn(() => {
    order.push("logout");
  });
  handle.close = jest.fn(() => {
    order.push("close");
  });
  const map = native({ close: () => order.push("map_closed") });
  const navigation = sessionNavigation({
    covers: () => true,
    open: () => map,
  });
  navigation?.navigation.height(530, 0, 0);
  return { game: createGame(handle, { navigation }) };
}

test("logout closes the navmesh after core logs out, without waiting for the socket", () => {
  const order: string[] = [];
  const { game } = tracked(order);
  game.logout();
  expect(order).toEqual(["logout", "map_closed"]);
});

test("close closes the navmesh after core closes and refuses later travel", () => {
  const order: string[] = [];
  const { game } = tracked(order);
  game.close();
  expect(order).toEqual(["close", "map_closed"]);
  expect(() => game.goTo({ kind: "point", x: 1, y: 0 })).toThrow(
    "session_closed",
  );
});
