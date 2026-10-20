
export function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}

export function getStrategyDuration(keyframes) {
  return keyframes.length
    ? Math.max(...keyframes.map((f) => f.time))
    : 0;
}

export function getPositionsAtTime(keyframes, time) {
  if (!keyframes.length) return {};

  const frames = [...keyframes].sort(
    (a, b) => a.time - b.time
  );

  if (time <= frames[0].time) {
    return frames[0].positions;
  }

  const last = frames[frames.length - 1];

  if (time >= last.time) {
    return last.positions;
  }

  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];

    if (time < a.time || time > b.time) continue;

    const alpha =
      (time - a.time) / (b.time - a.time);

    return Object.fromEntries(
      Object.keys(a.positions).map((id) => {
        const p = a.positions[id];
        const q = b.positions[id] ?? p;

        return [
          id,
          {
            x: lerp(p.x, q.x, alpha),
            y: lerp(p.y, q.y, alpha),
          },
        ];
      })
    );
  }

  return last.positions;
}

export function getMovementPosition(samples, elapsed) {
  if (!samples.length) return null;

  if (elapsed <= samples[0].time) {
    return samples[0];
  }

  const last = samples[samples.length - 1];

  if (elapsed >= last.time) {
    return last;
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];

    if (elapsed > b.time) continue;

    const alpha =
      b.time === a.time
        ? 1
        : (elapsed - a.time) / (b.time - a.time);

    return {
      x: lerp(a.x, b.x, alpha),
      y: lerp(a.y, b.y, alpha),
    };
  }

  return last;
}

export function getSimulatedPositions(strategy, time) {
  const positions = {
    ...getPositionsAtTime(strategy.keyframes, time),
  };

  for (const movement of strategy.movements ?? []) {
    if (
      time < movement.startTime ||
      time > movement.endTime
    ) {
      continue;
    }

    const position = getMovementPosition(
      movement.samples,
      time - movement.startTime
    );

    if (position) {
      positions[movement.playerId] = {
        x: position.x,
        y: position.y,
      };
    }
  }

  return positions;
}
