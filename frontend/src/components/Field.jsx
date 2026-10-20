
import { useEffect, useRef, useState } from "react";
import Player from "./Player.jsx";

import Disc from "./Disc.jsx";

import {
  getDiscState,
  getThrowPath,
} from "../simulation/discPhysics.js";


import {
  FIELD,
  createStrategy,
  applyPositions,
  validateStrategy,
} from "../models/strategy.js";

import {
  getStrategyDuration,
  getSimulatedPositions,
} from "../simulation/interpolation.js";

const roundTime = (value) =>
  Math.round(value * 1000) / 1000;

export default function Field() {
  const svgRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragRef = useRef(null);
  const playheadRef = useRef(0);

  const [strategy, setStrategy] = useState(createStrategy);
  const [playhead, setPlayhead] = useState(0);
  const [editingTime, setEditingTime] = useState(0);
  const [newTime, setNewTime] = useState("2");
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [message, setMessage] = useState("");

  const [recordMode, setRecordMode] = useState(false);
  const [draftMovement, setDraftMovement] = useState(null);

  const [throwReceiver, setThrowReceiver] = useState("O2");
  const [throwDuration, setThrowDuration] = useState("1");
  const [throwCurvature, setThrowCurvature] = useState("5");
  const [throwHeight, setThrowHeight] = useState("3");

  const duration = Math.max(
    getStrategyDuration(strategy.keyframes),
    ...(strategy.events ?? [])
      .filter((event) => event.type === "throw")
      .map((event) => event.endTime),
    0
  );

  const sortedFrames = [...strategy.keyframes].sort(
    (a, b) => a.time - b.time
  );

  const displayedPositions = {
    ...getSimulatedPositions(strategy, playhead),
  };

  if (draftMovement?.samples.length) {
    const last =
      draftMovement.samples[
        draftMovement.samples.length - 1
      ];

    displayedPositions[draftMovement.playerId] = {
      x: last.x,
      y: last.y,
    };
  }

  const players = applyPositions(
    strategy.players,
    displayedPositions
  );

  const disc = getDiscState(strategy, playhead);

  const recordedThrows = (strategy.events ?? [])
    .filter((event) => event.type === "throw")
    .sort((a, b) => a.startTime - b.startTime);

  const canEdit =
    !isPlaying && editingTime !== null;

  const recording = draftMovement !== null;

  function seek(time, max = duration) {
    const next = Math.max(
      0,
      Math.min(max, Number(time) || 0)
    );

    playheadRef.current = next;
    setPlayhead(next);
  }

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying) return;

    let animationId;
    let previousTimestamp = null;

    function animate(timestamp) {
      if (previousTimestamp === null) {
        previousTimestamp = timestamp;
      }

      const dt =
        (timestamp - previousTimestamp) / 1000;

      previousTimestamp = timestamp;

      const next = Math.min(
        duration,
        playheadRef.current + dt * speed
      );

      playheadRef.current = next;
      setPlayhead(next);

      if (next >= duration) {
        setIsPlaying(false);
        return;
      }

      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, speed, duration]);

  function togglePlayback() {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (duration <= 0) {
      setMessage(
        "Create a keyframe or record movement first."
      );
      return;
    }

    if (recording) return;

    if (playheadRef.current >= duration) {
      seek(0);
    }

    setRecordMode(false);
    setEditingTime(null);
    setIsPlaying(true);
    setMessage("");
  }

  function resetPlayback() {
    if (recording) return;

    setIsPlaying(false);
    setRecordMode(false);
    seek(0);
    setEditingTime(0);

    setMessage("Returned to the initial formation.");
  }

  function handleScrub(event) {
    if (recording) return;

    setIsPlaying(false);
    setRecordMode(false);
    setEditingTime(null);
    seek(event.target.value);
  }

  function selectKeyframe(time) {
    if (recording) return;

    setIsPlaying(false);
    setRecordMode(false);
    seek(time);
    setEditingTime(time);

    setMessage(`Editing keyframe at ${time}s.`);
  }

  // Convert mouse coordinates into field coordinates
  function getFieldPosition(event) {
    const matrix = svgRef.current?.getScreenCTM();

    if (!matrix) return null;

    const point = new DOMPoint(
      event.clientX,
      event.clientY
    );

    const p = point.matrixTransform(
      matrix.inverse()
    );

    return {
      x: Math.max(
        0,
        Math.min(FIELD.length, p.x)
      ),
      y: Math.max(
        0,
        Math.min(FIELD.width, p.y)
      ),
    };
  }

  // Begin normal dragging or movement recording
  function startDragging(event, playerId) {
    if (!canEdit || dragRef.current) return;

    const player = players.find(
      (p) => p.id === playerId
    );

    if (!player) return;

    // Protect existing recorded path anchors.
    if (
      !recordMode &&
      (strategy.movements ?? []).some(
        (m) =>
          m.playerId === playerId &&
          (
            m.startTime === editingTime ||
            m.endTime === editingTime
          )
      )
    ) {
      setMessage(
        `Delete ${playerId}'s anchored movement before editing.`
      );
      return;
    }

    // Prevent overlapping recordings for one player.
    if (
      recordMode &&
      (strategy.movements ?? []).some(
        (m) =>
          m.playerId === playerId &&
          m.startTime <= editingTime &&
          m.endTime > editingTime
      )
    ) {
      setMessage(
        `A path already covers ${playerId} at ${editingTime}s. Delete it first.`
      );
      return;
    }

    event.preventDefault();

    const session = {
      pointerId: event.pointerId,
      playerId,
      startTime: editingTime,
      startedAt: performance.now(),
      recording: recordMode,
      samples: [
        {
          time: 0,
          x: player.x,
          y: player.y,
        },
      ],
    };

    dragRef.current = session;

    svgRef.current?.setPointerCapture(
      event.pointerId
    );

    if (recordMode) {
      setDraftMovement({
        ...session,
        samples: [...session.samples],
      });

      setMessage(
        `Recording ${playerId}. Drag and release to save.`
      );
    }
  }

  // Add a new sampled point to the route
  function appendSample(session, position, elapsed) {
    const previous =
      session.samples[session.samples.length - 1];

    const time = Math.max(
      previous.time,
      roundTime(elapsed)
    );

    session.samples.push({
      time,
      x: position.x,
      y: position.y,
    });

    setDraftMovement({
      ...session,
      samples: [...session.samples],
    });
  }

  // Track mouse movement
  function handlePointerMove(event) {
    const session = dragRef.current;

    if (
      !session ||
      event.pointerId !== session.pointerId
    ) {
      return;
    }

    const position = getFieldPosition(event);

    if (!position) return;

    if (session.recording) {
      appendSample(
        session,
        position,
        (performance.now() - session.startedAt) / 1000
      );
      return;
    }

    // Normal keyframe editing
    setStrategy((previous) => ({
      ...previous,

      players:
        editingTime === 0
          ? previous.players.map((p) =>
              p.id === session.playerId
                ? { ...p, ...position }
                : p
            )
          : previous.players,

      keyframes: previous.keyframes.map((frame) =>
        frame.time === editingTime
          ? {
              ...frame,
              positions: {
                ...frame.positions,
                [session.playerId]: position,
              },
            }
          : frame
      ),
    }));
  }

  // Save the recorded path when the mouse is released
  function finishDragging(event, cancelled = false) {
    const session = dragRef.current;

    if (
      !session ||
      event.pointerId !== session.pointerId
    ) {
      return;
    }

    dragRef.current = null;

    if (session.recording) {
      if (!cancelled) {
        const position =
          getFieldPosition(event) ??
          session.samples[session.samples.length - 1];

        const elapsed = Math.max(
          0.05,
          (performance.now() - session.startedAt) / 1000
        );

        let endTime = roundTime(
          session.startTime + elapsed
        );

        while (
          strategy.keyframes.some(
            (f) => f.time === endTime
          )
        ) {
          endTime = roundTime(endTime + 0.001);
        }

        // Avoid overwriting another recording
        const overlaps = (
          strategy.movements ?? []
        ).some(
          (m) =>
            m.playerId === session.playerId &&
            session.startTime < m.endTime &&
            endTime > m.startTime
        );

        if (overlaps) {
          setMessage(
            "Recording overlaps an existing path. Delete the old path or choose another start time."
          );
        } else {
          const trackDuration =
            endTime - session.startTime;

          const samples = [
            ...session.samples.filter(
              (s) => s.time <= trackDuration
            ),
            {
              time: roundTime(trackDuration),
              x: position.x,
              y: position.y,
            },
          ];

          const movement = {
            id: crypto.randomUUID(),
            playerId: session.playerId,
            startTime: session.startTime,
            endTime,
            samples,
          };

          setStrategy((previous) => ({
            ...previous,
            movements: [
              ...(previous.movements ?? []),
              movement,
            ],
            keyframes: [
              ...previous.keyframes,
              {
                time: endTime,
                positions: {
                  ...getSimulatedPositions(
                    previous,
                    endTime
                  ),
                  [session.playerId]: {
                    x: position.x,
                    y: position.y,
                  },
                },
              },
            ],
          }));

          seek(
            endTime,
            Math.max(duration, endTime)
          );

          setEditingTime(endTime);
          setNewTime(
            String(roundTime(endTime + 2))
          );

          setMessage(
            `Saved ${session.playerId}: ` +
            `${samples.length} path points, ` +
            `${trackDuration.toFixed(2)}s.`
          );
        }
      } else {
        setMessage("Recording cancelled.");
      }

      setDraftMovement(null);
      setRecordMode(false);
    }

    if (
      svgRef.current?.hasPointerCapture(
        event.pointerId
      )
    ) {
      svgRef.current.releasePointerCapture(
        event.pointerId
      );
    }
  }

  // Add a regular keyframe
  function addKeyframe() {
    if (recording) return;

    const time = Number(newTime);

    if (
      newTime.trim() === "" ||
      !Number.isFinite(time) ||
      time < 0
    ) {
      setMessage(
        "Enter a valid non-negative keyframe time."
      );
      return;
    }

    if (
      strategy.keyframes.some(
        (f) => f.time === time
      )
    ) {
      setMessage(
        `A keyframe already exists at ${time}s.`
      );
      return;
    }

    setIsPlaying(false);

    const frame = {
      time,
      positions: structuredClone(
        getSimulatedPositions(strategy, time)
      ),
    };

    setStrategy((previous) => ({
      ...previous,
      keyframes: [
        ...previous.keyframes,
        frame,
      ],
    }));

    seek(time, Math.max(duration, time));
    setEditingTime(time);

    setNewTime(
      String(
        roundTime(Math.max(duration, time) + 2)
      )
    );

    setRecordMode(false);
    setMessage(`Keyframe added at ${time}s.`);
  }

  function deleteKeyframe() {
    if (
      recording ||
      editingTime === null ||
      editingTime === 0
    ) {
      return;
    }

    if (
      (strategy.movements ?? []).some(
        (m) =>
          m.startTime === editingTime ||
          m.endTime === editingTime
      )
    ) {
      setMessage(
        "Delete attached movement recordings before deleting this keyframe."
      );
      return;
    }

    setIsPlaying(false);

    setStrategy((previous) => ({
      ...previous,
      keyframes: previous.keyframes.filter(
        (f) => f.time !== editingTime
      ),
    }));

    seek(0);
    setEditingTime(0);
    setRecordMode(false);
    setMessage("Keyframe deleted.");
  }

function addThrow() {
  if (recording || isPlaying || editingTime === null) {
    setMessage("Select a keyframe before adding a throw.");
    return;
  }

  const startTime = editingTime;
  const flightTime = Number(throwDuration);
  const curvature = Number(throwCurvature);
  const maxHeight = Number(throwHeight);

  if (
    !Number.isFinite(flightTime) ||
    flightTime <= 0 ||
    !Number.isFinite(curvature) ||
    !Number.isFinite(maxHeight) ||
    maxHeight < 0
  ) {
    setMessage("Enter valid throw settings.");
    return;
  }

  const endTime = Math.round(
    (startTime + flightTime) * 1000
  ) / 1000;

  // Only one throw can be in flight at a time.
  const overlaps = recordedThrows.some(
    (event) =>
      startTime < event.endTime &&
      endTime > event.startTime
  );

  if (overlaps) {
    setMessage("This throw overlaps another throw.");
    return;
  }

  const previousThrows = recordedThrows.filter(
    (event) => event.endTime <= startTime
  );

  const mostRecent = previousThrows.at(-1);

  const holderId = mostRecent
    ? mostRecent.toPlayerId
    : strategy.disc.holderId;

  if (throwReceiver === holderId) {
    setMessage("Choose a different receiver.");
    return;
  }

  const receiver = strategy.players.find(
    (player) => player.id === throwReceiver
  );

  if (!receiver || receiver.team !== "offense") {
    setMessage("Choose a valid offensive receiver.");
    return;
  }

  // Prevent inserting an earlier throw that would
  // invalidate a later possession sequence.
  const laterThrow = recordedThrows.find(
    (event) => event.startTime >= endTime
  );

  if (
    laterThrow &&
    laterThrow.fromPlayerId !== throwReceiver
  ) {
    setMessage(
      `The next throw expects ${laterThrow.fromPlayerId} ` +
      `to hold the disc. Adjust the throw sequence.`
    );
    return;
  }

  const event = {
    id: crypto.randomUUID(),
    type: "throw",
    startTime,
    endTime,
    fromPlayerId: holderId,
    toPlayerId: throwReceiver,
    curvature,
    maxHeight,
  };

  setStrategy((previous) => ({
    ...previous,
    events: [...previous.events, event],
  }));

  setRecordMode(false);

  setMessage(
    `Throw recorded: ${holderId} → ${throwReceiver}, ` +
    `${flightTime}s.`
  );
}

function deleteThrow(id) {
  if (recording) return;

  const remaining = (strategy.events ?? [])
    .filter((event) => event.id !== id);

  // Removing a throw also removes its dependent
  // later throws, which may assume its receiver
  // has possession.
  const removed = recordedThrows.find(
    (event) => event.id === id
  );

  const safeEvents = removed
    ? remaining.filter(
        (event) =>
          event.type !== "throw" ||
          event.startTime < removed.startTime
      )
    : remaining;

    setIsPlaying(false);
    setStrategy((previous) => ({
      ...previous,
      events: safeEvents,
    }));

    seek(0);
    setEditingTime(0);

    setMessage(
      "Throw deleted. Dependent later throws were also removed."
    );
  }

  function deleteMovement(id) {
    if (recording) return;

    setIsPlaying(false);

    setStrategy((previous) => ({
      ...previous,
      movements: (
        previous.movements ?? []
      ).filter((m) => m.id !== id),
    }));

    seek(0);
    setEditingTime(0);

    setMessage(
      "Movement track deleted. Its endpoint keyframe remains editable."
    );
  }

  function exportJSON() {
    try {
      validateStrategy(strategy);

      const blob = new Blob(
        [JSON.stringify(strategy, null, 2)],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "ultimate-strategy.json";

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(
        () => URL.revokeObjectURL(url),
        1000
      );

      setMessage("Strategy exported.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function importJSON(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const imported = JSON.parse(
        await file.text()
      );

      validateStrategy(imported);

      setIsPlaying(false);
      dragRef.current = null;
      setDraftMovement(null);
      setRecordMode(false);

      setStrategy({
        ...imported,
        movements: imported.movements ?? [],
      });

      seek(0);
      setEditingTime(0);

      setNewTime(
        String(
          roundTime(
            getStrategyDuration(
              imported.keyframes
            ) + 2
          )
        )
      );

      setMessage(
        "Strategy imported successfully."
      );
    } catch (error) {
      setMessage(
        `Import failed: ${error.message}`
      );
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="editor">
      <div className="editor-header">
        <div>
          <h2>
            Ultimate Frisbee Strategy Editor
          </h2>
          <p>
            Record formations, draw actual movement
            paths, and play your strategy.
          </p>
        </div>

        <div className="editor-actions">
          <button
            onClick={exportJSON}
            disabled={recording}
          >
            Export JSON
          </button>

          <button
            className="secondary-button"
            disabled={recording}
            onClick={() =>
              fileInputRef.current?.click()
            }
          >
            Import JSON
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={importJSON}
            style={{ display: "none" }}
          />
        </div>
      </div>

      <div className="strategy-name">
        <label htmlFor="strategy-name">
          Strategy Name
        </label>

        <input
          id="strategy-name"
          value={strategy.name}
          disabled={recording}
          onChange={(event) =>
            setStrategy((previous) => ({
              ...previous,
              name: event.target.value,
            }))
          }
        />
      </div>

      <div
        style={{
          background: "#0f172a",
          padding: "12px",
          borderRadius: "8px",
          marginBottom: "15px",
          color: "#facc15",
          fontSize: "14px",
        }}
      >
        <strong>Disc Debug:</strong>
        {" "}Time: {playhead.toFixed(2)}s
        {" | "}Throws: {recordedThrows.length}
        {" | "}State: {disc.inFlight ? "FLYING" : "HELD"}
        {" | "}Holder: {disc.holderId ?? "None"}
        {" | "}X: {disc.x.toFixed(2)}
        {" | "}Y: {disc.y.toFixed(2)}
      </div>

      <div className="field-info">
        {recording
          ? "Recording live movement..."
          : canEdit
          ? `Editing recorded formation at ${editingTime}s`
          : `Previewing at ${playhead.toFixed(2)}s`}
      </div>

      <svg
        ref={svgRef}
        className="field"
        viewBox={`0 0 ${FIELD.length} ${FIELD.width}`}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) =>
          finishDragging(event)
        }
        onPointerCancel={(event) =>
          finishDragging(event, true)
        }
        onLostPointerCapture={(event) => {
          if (
            dragRef.current &&
            event.pointerId ===
              dragRef.current.pointerId
          ) {
            dragRef.current = null;
            setDraftMovement(null);
            setRecordMode(false);
            setIsPlaying(false);
            seek(startTime);
            setEditingTime(startTime);
          }
        }}
      >
        <rect
          width={FIELD.length}
          height={FIELD.width}
          fill="#237750"
        />

        <rect
          width={FIELD.endzoneLength}
          height={FIELD.width}
          fill="#1a6044"
        />

        <rect
          x={
            FIELD.length -
            FIELD.endzoneLength
          }
          width={FIELD.endzoneLength}
          height={FIELD.width}
          fill="#1a6044"
        />

        <rect
          x="0.2"
          y="0.2"
          width={FIELD.length - 0.4}
          height={FIELD.width - 0.4}
          fill="none"
          stroke="white"
          strokeWidth="0.3"
        />

        <line
          x1={FIELD.endzoneLength}
          y1="0"
          x2={FIELD.endzoneLength}
          y2={FIELD.width}
          stroke="white"
          strokeWidth="0.3"
        />

        <line
          x1={
            FIELD.length -
            FIELD.endzoneLength
          }
          y1="0"
          x2={
            FIELD.length -
            FIELD.endzoneLength
          }
          y2={FIELD.width}
          stroke="white"
          strokeWidth="0.3"
        />

        {/* Saved movement paths */}
        {(strategy.movements ?? []).map(
          (movement) => (
            <polyline
              key={movement.id}
              fill="none"
              stroke="#facc15"
              strokeWidth="0.35"
              strokeDasharray="1 0.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
              points={movement.samples
                .map(
                  (s) => `${s.x},${s.y}`
                )
                .join(" ")}
            />
          )
        )}

        {/* Movement being recorded */}
        {draftMovement && (
          <polyline
            fill="none"
            stroke="white"
            strokeWidth="0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
            points={draftMovement.samples
              .map((s) => `${s.x},${s.y}`)
              .join(" ")}
          />
        )}

        {/* Recorded Frisbee throw paths */}
        {recordedThrows.map((event) => {
          const path = getThrowPath(strategy, event);

          return (
            <polyline
              key={event.id}
              points={path
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              fill="none"
              stroke="#fb923c"
              strokeWidth="0.35"
              strokeDasharray="0.8 0.6"
              strokeLinecap="round"
              pointerEvents="none"
            />
          );
        })}

        {/* Players */}
        {players.map((player) => (
          <Player
            key={player.id}
            player={player}
            onPointerDown={startDragging}
          />
        ))}

        <Disc disc={disc} />

      </svg>

      <div className="legend">
        <span>🔵 Offense: 7</span>
        <span>🔴 Defense: 7</span>
        <span>Field: 100m × 37m</span>
        <span>🟡 Saved movement paths</span>
      </div>

      <section className="timeline-panel">
        <div className="movement-recorder">
          <h3>Movement Path Recorder</h3>

          <p>
            Select a keyframe, arm the recorder,
            then drag one player along the route.
          </p>

          <button
            className={
              recordMode
                ? "record-button active"
                : "record-button"
            }
            disabled={!canEdit || recording}
            onClick={() =>
              setRecordMode(
                (enabled) => !enabled
              )
            }
          >
            {recording
              ? "● Recording..."
              : recordMode
              ? "● Armed — drag a player"
              : "● Record Movement"}
          </button>

          <p className="recorder-hint">
            {recording
              ? "Release the player to save its path."
              : recordMode
              ? `Starting at ${editingTime}s. Drag any player to record.`
              : "Normal dragging edits the selected keyframe."}
          </p>

          <h4>
            Saved paths (
            {(strategy.movements ?? []).length}
            )
          </h4>

          <div className="movement-list">
            {(strategy.movements ?? []).length ===
              0 && (
              <p>
                No movement paths recorded yet.
              </p>
            )}

            {(strategy.movements ?? []).map(
              (movement) => (
                <div
                  className="movement-list-item"
                  key={movement.id}
                >
                  <span>
                    {movement.playerId}:{" "}
                    {movement.startTime.toFixed(2)}
                    s →{" "}
                    {movement.endTime.toFixed(2)}
                    s (
                    {movement.samples.length} points)
                  </span>

                  <button
                    className="danger-button"
                    disabled={recording}
                    onClick={() =>
                      deleteMovement(
                        movement.id
                      )
                    }
                  >
                    Delete Path
                  </button>
                </div>
              )
            )}
          </div>
        </div>

        <div className="throw-panel">
          <h3>🥏 Frisbee Throw Recorder</h3>

          <p>
            Select a keyframe, choose a receiver, and
            configure the flight of the disc.
          </p>

          <p>
            Current disc holder:{" "}
            <strong>
              {getDiscState(strategy, editingTime ?? playhead)
                .holderId ?? "Disc in flight"}
            </strong>
          </p>

          <div className="throw-controls">
            <label>
              Receiver
              <select
                value={throwReceiver}
                onChange={(event) =>
                  setThrowReceiver(event.target.value)
                }
              >
                {strategy.players
                  .filter((player) => player.team === "offense")
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.id}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Duration (seconds)
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={throwDuration}
                onChange={(event) =>
                  setThrowDuration(event.target.value)
                }
              />
            </label>

            <label>
              Curvature
              <input
                type="number"
                step="1"
                value={throwCurvature}
                onChange={(event) =>
                  setThrowCurvature(event.target.value)
                }
              />
            </label>

            <label>
              Maximum height (m)
              <input
                type="number"
                min="0"
                step="0.5"
                value={throwHeight}
                onChange={(event) =>
                  setThrowHeight(event.target.value)
                }
              />
            </label>
          </div>

          <button
            onClick={addThrow}
            disabled={
              recording ||
              isPlaying ||
              editingTime === null
            }
          >
            + Record Throw
          </button>

          <h4>Recorded Throws ({recordedThrows.length})</h4>

          {recordedThrows.length === 0 && (
            <p>No throws recorded yet.</p>
          )}

          {recordedThrows.map((event) => (
            <div className="throw-list-item" key={event.id}>
              <span>
                {event.fromPlayerId} → {event.toPlayerId}
                {" | "}
                {event.startTime.toFixed(2)}s –{" "}
                {event.endTime.toFixed(2)}s
              </span>

              <button
                className="danger-button"
                disabled={recording}
                onClick={() => deleteThrow(event.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        <h3>Simulation Playback</h3>

        <div className="playback-controls">
          <button
            onClick={togglePlayback}
            disabled={
              duration === 0 || recording
            }
          >
            {isPlaying
              ? "⏸ Pause"
              : "▶ Play"}
          </button>

          <button
            className="secondary-button"
            onClick={resetPlayback}
            disabled={recording}
          >
            ↺ Reset
          </button>

          <label htmlFor="playback-speed">
            Speed:
          </label>

          <select
            id="playback-speed"
            value={speed}
            onChange={(event) =>
              setSpeed(
                Number(event.target.value)
              )
            }
          >
            <option value={0.5}>
              0.5×
            </option>
            <option value={1}>
              1×
            </option>
            <option value={2}>
              2×
            </option>
          </select>
        </div>

        <div className="scrubber">
          <input
            aria-label="Simulation timeline"
            type="range"
            min="0"
            max={Math.max(duration, 0.01)}
            step="0.01"
            value={playhead}
            disabled={recording}
            onChange={handleScrub}
          />

          <div className="timeline-time">
            <span>
              {playhead.toFixed(2)}s
            </span>
            <span>
              {duration.toFixed(2)}s
            </span>
          </div>
        </div>

        <h3>Recorded Keyframes</h3>

        <p>
          Select a keyframe to edit positions.
          Scrubbing previews without editing.
        </p>

        <div className="timeline-frames">
          {sortedFrames.map((frame) => (
            <button
              key={frame.time}
              disabled={recording}
              className={
                editingTime === frame.time &&
                !isPlaying
                  ? "frame-button active"
                  : "frame-button"
              }
              onClick={() =>
                selectKeyframe(frame.time)
              }
            >
              {frame.time}s
            </button>
          ))}
        </div>

        <div className="record-controls">
          <label htmlFor="keyframe-time">
            New keyframe at
          </label>

          <input
            id="keyframe-time"
            type="number"
            min="0"
            step="0.1"
            value={newTime}
            disabled={recording}
            onChange={(event) =>
              setNewTime(
                event.target.value
              )
            }
          />

          <button
            onClick={addKeyframe}
            disabled={recording}
          >
            + Record Keyframe
          </button>

          <button
            className="danger-button"
            onClick={deleteKeyframe}
            disabled={
              recording ||
              isPlaying ||
              editingTime === null ||
              editingTime === 0
            }
          >
            Delete Selected
          </button>
        </div>

        <p
          className="record-status"
          role="status"
        >
          {message}
        </p>

        <div className="record-summary">
          Total keyframes:{" "}
          {strategy.keyframes.length}
        </div>
      </section>
    </div>
  );
}