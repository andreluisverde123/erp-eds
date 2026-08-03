/// Identidade da empresa dona do sistema (EDS). Fonte única de nome, marca,
/// dados cadastrais e cores — consumida pela API e pelo web.
export * from './company';

export type ID = string;

export interface BaseEntity {
  id: ID;
  createdAt: string;
  updatedAt: string;
}
