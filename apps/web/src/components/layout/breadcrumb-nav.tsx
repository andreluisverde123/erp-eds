import { useLocation, Link } from 'react-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@repo/ui';

import { getBreadcrumbTrail } from '@/config/nav';

interface BreadcrumbNavProps {
  /// Segmento final dinâmico (ex.: nome real da obra numa página de
  /// detalhe) — anexado como um novo último crumb depois do que
  /// getBreadcrumbTrail devolve (que pra rotas aninhadas já termina no
  /// "pai" mais próximo, ex. "Obras"), sem precisar alterar a config de
  /// navegação.
  override?: string;
}

export function BreadcrumbNav({ override }: BreadcrumbNavProps) {
  const { pathname } = useLocation();
  const trail = getBreadcrumbTrail(pathname);
  const crumbs = override ? [...trail, { title: override }] : trail;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const label = crumb.title;

          return (
            <div key={`${crumb.title}-${index}`} className="flex items-center gap-1.5 sm:gap-2.5">
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast || !crumb.path ? (
                  <BreadcrumbPage className="truncate">{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.path} className="truncate">
                      {label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </div>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
