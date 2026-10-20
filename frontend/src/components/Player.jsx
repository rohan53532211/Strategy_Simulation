
export default function Player({ player, onPointerDown }) {
  const color = player.team === "offense" ? "#3b82f6" : "#ef4444";

  return (
    <g
      transform={`translate(${player.x}, ${player.y})`}
      onPointerDown={(event) => onPointerDown(event, player.id)}
      style={{ cursor: "grab", touchAction: "none" }}
    >
      <circle
        r="1.8"
        fill={color}
        stroke="white"
        strokeWidth="0.3"
      />

      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="1.3"
        fill="white"
        fontWeight="bold"
        pointerEvents="none"
      >
        {player.number}
      </text>
    </g>
  );
}

