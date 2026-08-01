import { Card, CardContent, CardHeader, CardTitle, Progress } from '@repo/ui';

import type { ChartPoint } from '../types';

export function ProgressListCard({ title, data }: { title: string; data: ChartPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma obra em andamento no momento.
          </p>
        ) : (
          data.map((point) => (
            <div key={point.label} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{point.label}</span>
                <span className="text-muted-foreground">{point.value}%</span>
              </div>
              <Progress value={point.value} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
