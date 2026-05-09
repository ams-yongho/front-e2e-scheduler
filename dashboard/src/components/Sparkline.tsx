interface Props {
  data: number[];
  accent: string;
  width?: number;
  height?: number;
}

export function Sparkline({ data, accent, width = 130, height = 24 }: Props) {
  if (data.length === 0) {
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} />;
  }

  const max = 100;
  const min = Math.min(...data, 86);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const ys = data.map(v => height - ((v - min) / range) * (height - 6) - 3);
  const points = data.map((_, i) => `${(i * stepX).toFixed(1)},${ys[i].toFixed(1)}`).join(' ');

  const lastIdx = data.length - 1;
  const lastX = lastIdx * stepX;
  const lastY = ys[lastIdx];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={accent}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((v, i) =>
        v < 100 ? (
          <circle
            key={i}
            cx={(i * stepX).toFixed(1)}
            cy={ys[i].toFixed(1)}
            r={1.4}
            fill="var(--danger)"
            opacity={0.85}
          />
        ) : null
      )}
      <circle
        cx={lastX.toFixed(1)}
        cy={lastY.toFixed(1)}
        r={2.5}
        fill={accent}
        stroke="var(--surface-1)"
        strokeWidth={1.5}
      />
    </svg>
  );
}
