
import { getSimulatedPositions } from "./interpolation.js";

export function quadraticBezier(start, control, end, t) {
  const u = 1 - t;

  return {
    x:
      u * u * start.x +
      2 * u * t * control.x +
      t * t * end.x,

    y:
      u * u * start.y +
      2 * u * t * control.y +
      t * t * end.y,
  };
}

export function getThrowPosition(strategy, event, time) {
  const duration = event.endTime - event.startTime;

  const t = Math.max(
    0,
    Math.min(1, (time - event.startTime) / duration)
  );

  const startPositions = getSimulatedPositions(
    strategy,
    event.startTime
  );

  const endPositions = getSimulatedPositions(
    strategy,
    event.endTime
  );

  const start = startPositions[event.fromPlayerId];
  const end = endPositions[event.toPlayerId];

  if (!start || !end) return null;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);

  const curvature = event.curvature ?? 5;

  const control = {
    x:
      (start.x + end.x) / 2 -
      (distance ? dy / distance : 0) * curvature,

    y:
      (start.y + end.y) / 2 +
      (distance ? dx / distance : -1) * curvature,
  };

  const position = quadraticBezier(start, control, end, t);

  const height =
    4 * (event.maxHeight ?? 3) * t * (1 - t);

  return {
    ...position,
    height,
    inFlight: t > 0 && t < 1,
    holderId: null,
    throwId: event.id,
  };
}

export function getDiscState(strategy, time) {
  const throws = (strategy.events ?? [])
    .filter((event) => event.type === "throw")
    .sort((a, b) => a.startTime - b.startTime);

  let holderId = strategy.disc.holderId;

  for (const event of throws) {
    if (time < event.startTime) {
      break;
    }

    if (time < event.endTime) {
      const flight = getThrowPosition(strategy, event, time);

      if (flight) {
        return {
          ...flight,
          inFlight: true,
          holderId: null,
        };
      }
    }

    if (time >= event.endTime) {
      holderId = event.toPlayerId;
    }
  }

  const positions = getSimulatedPositions(strategy, time);
  const holder = positions[holderId];

  return {
    x: holder?.x ?? 0,
    y: holder?.y ?? 0,
    height: 0,
    holderId,
    inFlight: false,
    throwId: null,
  };
}

export function getThrowPath(strategy, event, steps = 50) {
  const points = [];

  for (let i = 0; i <= steps; i++) {
    const time =
      event.startTime +
      (event.endTime - event.startTime) * (i / steps);

    const position = getThrowPosition(
      strategy,
      event,
      time
    );

    if (position) {
      points.push(position);
    }
  }

  return points;
}
