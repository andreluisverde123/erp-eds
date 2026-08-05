import { Checkbox, Label } from '@repo/ui';

import { getModuleLabel } from '../permission-modules';
import type { Permission } from '../types';

interface PermissionCheckboxGroupProps {
  permissions: Permission[];
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
}

export function PermissionCheckboxGroup({
  permissions,
  selectedCodes,
  onChange,
}: PermissionCheckboxGroupProps) {
  const grouped = permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    (groups[permission.module] ??= []).push(permission);
    return groups;
  }, {});

  function toggle(code: string, checked: boolean) {
    onChange(
      checked ? [...selectedCodes, code] : selectedCodes.filter((selected) => selected !== code),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(grouped).map(([module, modulePermissions]) => (
        <div key={module} className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {getModuleLabel(module)}
          </p>
          {/* `gap-3` e não `gap-2`: as descrições são frases inteiras e quase
              sempre quebram em duas linhas. Com o espaçamento antigo, a
              segunda linha de um item ficava mais perto do item seguinte do
              que da própria primeira linha — e a lista virava um bloco só. */}
          <div className="flex flex-col gap-3">
            {modulePermissions.map((permission) => (
              // `items-start`, não `items-center`: com rótulo de duas linhas o
              // checkbox centralizado flutuava no meio do parágrafo. O
              // `mt-0.5` alinha a caixa opticamente com a PRIMEIRA linha.
              <div key={permission.code} className="flex items-start gap-2.5">
                <Checkbox
                  id={`perm-${permission.code}`}
                  className="mt-0.5 shrink-0"
                  checked={selectedCodes.includes(permission.code)}
                  onCheckedChange={(checked) => toggle(permission.code, checked === true)}
                />
                {/* O `Label` do Design System traz `leading-none`, pensado para
                    rótulo de uma linha; aqui o texto quebra e as linhas
                    colavam. `leading-relaxed` corrige LOCALMENTE — mexer no
                    componente afetaria todo rótulo do sistema. O `block`
                    desfaz o `flex` do Label, que impedia a quebra natural. */}
                <Label
                  htmlFor={`perm-${permission.code}`}
                  className="block cursor-pointer text-sm leading-relaxed font-normal text-foreground"
                >
                  {permission.description ?? permission.code}
                </Label>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
