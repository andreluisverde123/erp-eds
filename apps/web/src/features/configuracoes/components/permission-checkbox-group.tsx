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
    <div className="flex flex-col gap-3">
      {Object.entries(grouped).map(([module, modulePermissions]) => (
        <div key={module} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {getModuleLabel(module)}
          </p>
          <div className="flex flex-col gap-2">
            {modulePermissions.map((permission) => (
              <div key={permission.code} className="flex items-center gap-2">
                <Checkbox
                  id={`perm-${permission.code}`}
                  checked={selectedCodes.includes(permission.code)}
                  onCheckedChange={(checked) => toggle(permission.code, checked === true)}
                />
                <Label
                  htmlFor={`perm-${permission.code}`}
                  className="cursor-pointer font-normal text-foreground"
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
