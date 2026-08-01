import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';

import type { ChartPoint } from '../types';

interface IndicatorBarChartProps {
  title: string;
  data: ChartPoint[];
  valueFormatter?: (value: number) => string;
  horizontal?: boolean;
}

export function IndicatorBarChart({
  title,
  data,
  valueFormatter,
  horizontal,
}: IndicatorBarChartProps) {
  const format = valueFormatter ?? ((value: number) => String(value));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            Sem dados no período.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={data}
              layout={horizontal ? 'vertical' : 'horizontal'}
              margin={{ left: 4, right: 12 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              {horizontal ? (
                <>
                  <XAxis type="number" tickFormatter={format} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
                </>
              ) : (
                <>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={format} tick={{ fontSize: 11 }} width={64} />
                </>
              )}
              <Tooltip formatter={(value) => format(Number(value))} />
              <Bar
                dataKey="value"
                fill="var(--color-primary, #2563eb)"
                radius={[4, 4, 4, 4]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
