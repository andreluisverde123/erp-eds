import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';

import type { ChartPoint } from '../types';

interface IndicatorLineChartProps {
  title: string;
  data: ChartPoint[];
  valueFormatter?: (value: number) => string;
}

export function IndicatorLineChart({ title, data, valueFormatter }: IndicatorLineChartProps) {
  const format = valueFormatter ?? ((value: number) => String(value));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ left: 4, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={format} tick={{ fontSize: 11 }} width={64} />
            <Tooltip formatter={(value) => format(Number(value))} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-primary, #2563eb)"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
