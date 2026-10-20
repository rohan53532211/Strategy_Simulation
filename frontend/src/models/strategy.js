
export const FIELD = {
  length: 100,
  width: 37,
  endzoneLength: 18,
};

export function createInitialPlayers() {
  return [
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `O${i + 1}`,
      number: i + 1,
      team: "offense",
      x: 25 + (i % 3) * 8,
      y: 7 + Math.floor(i / 3) * 11,
    })),

    ...Array.from({ length: 7 }, (_, i) => ({
      id: `D${i + 1}`,
      number: i + 1,
      team: "defense",
      x: 55 + (i % 3) * 8,
      y: 7 + Math.floor(i / 3) * 11,
    })),
  ];
}

export function capturePositions(players) {
  return Object.fromEntries(
    players.map(({ id, x, y }) => [
      id,
      { x, y },
    ])
  );
}

export function applyPositions(players, positions) {
  return players.map((player) => ({
    ...player,
    ...(positions[player.id] ?? {}),
  }));
}

export function createStrategy() {
  const players = createInitialPlayers();

  return {
    version: 1,
    name: "Untitled Strategy",
    field: { ...FIELD },
    players,
    disc: {
      holderId: "O1",
    },
    keyframes: [
      {
        time: 0,
        positions: capturePositions(players),
      },
    ],
    movements: [],
    events: [],
  };
}

export function validateStrategy(data) {
  if (!data || data.version !== 1) {
    throw new Error("Unsupported strategy version.");
  }

  if (typeof data.name !== "string") {
    throw new Error("Invalid strategy name.");
  }

  if (
    !data.field ||
    data.field.length !== FIELD.length ||
    data.field.width !== FIELD.width ||
    data.field.endzoneLength !== FIELD.endzoneLength
  ) {
    throw new Error("Unsupported field dimensions.");
  }

  if (
    !Array.isArray(data.players) ||
    data.players.length !== 14
  ) {
    throw new Error("Expected 14 players.");
  }

  const ids = new Set(data.players.map((p) => p.id));

  if (
    ids.size !== 14 ||
    data.players.some(
      (p) =>
        typeof p.id !== "string" ||
        !["offense", "defense"].includes(p.team) ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > FIELD.length ||
        p.y < 0 ||
        p.y > FIELD.width
    )
  ) {
    throw new Error("Invalid player data.");
  }

  if (
    !Array.isArray(data.keyframes) ||
    !data.keyframes.length
  ) {
    throw new Error("No keyframes found.");
  }

  const times = new Set();

  const isPosition = (p) =>
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= 0 &&
    p.x <= FIELD.length &&
    p.y >= 0 &&
    p.y <= FIELD.width;

  for (const frame of data.keyframes) {
    if (
      !Number.isFinite(frame.time) ||
      frame.time < 0 ||
      times.has(frame.time)
    ) {
      throw new Error("Invalid or duplicate keyframe time.");
    }

    times.add(frame.time);

    if (
      !frame.positions ||
      typeof frame.positions !== "object"
    ) {
      throw new Error("Invalid keyframe positions.");
    }

    for (const id of ids) {
      if (!isPosition(frame.positions[id])) {
        throw new Error(`Invalid position for ${id}.`);
      }
    }
  }

  if (!times.has(0)) {
    throw new Error("The 0s keyframe is required.");
  }

  if (
    !data.disc ||
    !ids.has(data.disc.holderId) ||
    !Array.isArray(data.events)
  ) {
    throw new Error("Invalid disc/events.");
  }

  if (
    data.movements !== undefined &&
    !Array.isArray(data.movements)
  ) {
    throw new Error("Invalid movement tracks.");
  }

  const tracks = data.movements ?? [];
  const trackIds = new Set();

  for (const m of tracks) {
    if (
      typeof m.id !== "string" ||
      trackIds.has(m.id) ||
      !ids.has(m.playerId) ||
      !Number.isFinite(m.startTime) ||
      !Number.isFinite(m.endTime) ||
      m.startTime < 0 ||
      m.endTime <= m.startTime ||
      !times.has(m.startTime) ||
      !times.has(m.endTime) ||
      !Array.isArray(m.samples) ||
      m.samples.length < 2
    ) {
      throw new Error("Invalid movement track.");
    }

    trackIds.add(m.id);

    const length = m.endTime - m.startTime;
    let previous = -1;

    for (const sample of m.samples) {
      if (
        !isPosition(sample) ||
        !Number.isFinite(sample.time) ||
        sample.time < previous ||
        sample.time < 0 ||
        sample.time > length + 0.001
      ) {
        throw new Error("Invalid movement sample.");
      }

      previous = sample.time;
    }

    if (
      Math.abs(m.samples[0].time) > 0.001 ||
      Math.abs(
        m.samples[m.samples.length - 1].time - length
      ) > 0.002
    ) {
      throw new Error(
        "Movement samples must cover the track duration."
      );
    }
  }

  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const a = tracks[i];
      const b = tracks[j];

      if (
        a.playerId === b.playerId &&
        a.startTime < b.endTime &&
        b.startTime < a.endTime
      ) {
        throw new Error(
          "Overlapping movement tracks for the same player."
        );
      }
    }
  }


const throws = data.events
  .filter((event) => event.type === "throw")
  .sort((a, b) => a.startTime - b.startTime);

let expectedHolder = data.disc.holderId;
let previousEnd = 0;
const throwIds = new Set();

for (const event of throws) {
    if (
        typeof event.id !== "string" ||
        throwIds.has(event.id) ||
        !Number.isFinite(event.startTime) ||
        !Number.isFinite(event.endTime) ||
        event.startTime < previousEnd ||
        event.endTime <= event.startTime ||
        event.fromPlayerId !== expectedHolder ||
        !ids.has(event.toPlayerId) ||
        event.toPlayerId === event.fromPlayerId ||
        !Number.isFinite(event.curvature) ||
        !Number.isFinite(event.maxHeight) ||
        event.maxHeight < 0
    ) {
        throw new Error("Invalid Frisbee throw sequence.");
    }

    const receiver = data.players.find(
        (player) => player.id === event.toPlayerId
    );

    if (receiver?.team !== "offense") {
        throw new Error("Invalid throw receiver.");
    }

        throwIds.add(event.id);
        expectedHolder = event.toPlayerId;
        previousEnd = event.endTime;
    }

  return true;
}
