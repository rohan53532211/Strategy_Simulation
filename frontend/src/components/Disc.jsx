
export default function Disc({ disc }) {
  if (!disc) return null;

  const { x, y, height, inFlight, holderId } = disc;

  // Offset the disc slightly when held by a player.
  const discX = inFlight ? x : x + 2.2;
  const discY = inFlight ? y : y - 1.8;

  return (
    <g pointerEvents="none">
      {/* Shadow when the disc is flying */}
      {inFlight && (
        <ellipse
          cx={x}
          cy={y + 1.5}
          rx="1.1"
          ry="0.45"
          fill="#000000"
          opacity="0.3"
        />
      )}

      {/* Main Frisbee */}
      <ellipse
        cx={discX}
        cy={discY}
        rx={inFlight ? 1.5 : 1.2}
        ry={inFlight ? 0.75 : 0.6}
        fill="#facc15"
        stroke="#ffffff"
        strokeWidth="0.3"
      />

      {/* Disc center */}
      <ellipse
        cx={discX}
        cy={discY}
        rx="0.55"
        ry="0.25"
        fill="#ffffff"
      />

      {/* Flight height indicator */}
      {inFlight && (
        <text
          x={discX}
          y={discY - 2}
          fontSize="1.3"
          textAnchor="middle"
          fill="#ffffff"
        >
          {height.toFixed(1)}m
        </text>
      )}

      {/* Holder indicator */}
      {!inFlight && holderId && (
        <text
          x={discX}
          y={discY - 2}
          fontSize="1.2"
          textAnchor="middle"
          fill="#fde68a"
        >
          {holderId}
        </text>
      )}
    </g>
  );
}
