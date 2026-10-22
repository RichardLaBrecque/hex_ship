import { PARTS, type PartCatalog } from "../data/parts";
import { hexKey, neighbors } from "../hex/hex";
import { computeShipStats } from "./stats";
import { findBridges, isExhaustBlocked, type Ship } from "./ship";

export type Validation = {
  valid: boolean;
  problems: string[];
  disconnected: Set<string>; // hexKeys of parts not linked to the bridge
  blockedEngines: Set<string>; // hexKeys of engines whose exhaust hex is occupied
};

// hexKeys of every part reachable from the bridge through neighbouring hexes.
export function connectedToBridge(ship: Ship): Set<string> {
  const bridges = findBridges(ship);
  const reached = new Set<string>();
  if (bridges.length === 0) return reached;

  const queue = [bridges[0].hex];
  reached.add(hexKey(bridges[0].hex));
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const n of neighbors(current)) {
      const key = hexKey(n);
      if (ship.has(key) && !reached.has(key)) {
        reached.add(key);
        queue.push(n);
      }
    }
  }
  return reached;
}

export function validateShip(ship: Ship, catalog: PartCatalog = PARTS): Validation {
  const problems: string[] = [];

  const bridgeCount = findBridges(ship).length;
  if (bridgeCount === 0) problems.push("Ship needs a bridge.");
  if (bridgeCount > 1) problems.push("Ship can only have one bridge.");

  const connected = connectedToBridge(ship);
  const disconnected = new Set([...ship.keys()].filter((key) => !connected.has(key)));
  if (bridgeCount > 0 && disconnected.size > 0) {
    problems.push(`${disconnected.size} part(s) not connected to the bridge.`);
  }

  const blockedEngines = new Set<string>();
  for (const [key, part] of ship) {
    if (part.type === "engine" && isExhaustBlocked(ship, part)) blockedEngines.add(key);
  }
  if (blockedEngines.size > 0) problems.push(`${blockedEngines.size} engine exhaust(s) blocked.`);

  const stats = computeShipStats(ship, Infinity, catalog);
  if (stats.thrust <= 0) problems.push("No forward thrust: add an engine with its exhaust pointing back.");
  if (stats.fuelCapacity <= 0) problems.push("Ship needs a fuel tank.");
  if (stats.crewRequired > stats.crewCapacity) {
    problems.push(`Needs ${stats.crewRequired} crew but only has room for ${stats.crewCapacity}.`);
  }

  return { valid: problems.length === 0, problems, disconnected, blockedEngines };
}
