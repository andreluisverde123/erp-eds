import { useWatch, type Control } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@repo/ui';

import { CONSTRUCTION_STATUS_OPTIONS } from '../construction-site-status';
import type { ConstructionSiteFormValues } from '../construction-site-form-schema';
import { listSiteTeamCandidates } from '../site-team';

const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];

/// O RESPONSÁVEL, escolhido entre os usuários do sistema.
///
/// **Escolher aqui é o que dá a ele a obra no Diário.** Antes era texto livre
/// e não concedia nada: a obra ficava sem aparecer para ninguém, e o vínculo
/// só existia por script. O servidor cria o vínculo ao salvar.
///
/// A lista já vem filtrada pela API — só quem passa pelas duas portas do
/// Diário: o papel concede `diario.access` e o interruptor da pessoa está
/// ligado. Oferecer alguém fora disso criaria um responsável que não enxerga a
/// própria obra.
function SiteResponsibleField({ control }: { control: Control<ConstructionSiteFormValues> }) {
  const { data: candidatos, isLoading } = useQuery({
    queryKey: ['diario', 'acessos', 'candidatos'],
    queryFn: listSiteTeamCandidates,
    staleTime: 60_000,
  });

  // O nome herdado das obras cadastradas antes disto. Fica VISÍVEL enquanto
  // ninguém escolher um usuário: apagá-lo da tela perderia a única informação
  // que essas obras têm sobre quem responde por elas.
  const herdado = useWatch({ control, name: 'responsibleName' });
  const escolhido = useWatch({ control, name: 'responsibleId' });

  return (
    <FormField
      control={control}
      name="responsibleId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Responsável</FormLabel>
          <Select value={field.value || ''} onValueChange={field.onChange} disabled={isLoading}>
            <FormControl>
              <SelectTrigger className="w-full">
                {/* Filho explícito: sem ele o Radix espelha no gatilho o
                    conteúdo INTEIRO da opção — nome e e-mail —, e o campo é
                    estreito demais para os dois. Aqui fica só o nome; o
                    e-mail, que serve para distinguir homônimos, continua na
                    lista aberta. Mesma decisão do seletor de unidade na grade
                    de itens. */}
                <SelectValue
                  placeholder={
                    isLoading
                      ? 'Carregando…'
                      : candidatos?.length === 0
                        ? 'Ninguém com acesso ao Diário'
                        : 'Selecione o responsável'
                  }
                >
                  {(candidatos ?? []).find((p) => p.id === field.value)?.name}
                </SelectValue>
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {(candidatos ?? []).map((pessoa) => (
                <SelectItem key={pessoa.id} value={pessoa.id}>
                  <span>{pessoa.name}</span>
                  <span className="text-muted-foreground">{pessoa.email}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!escolhido && herdado && (
            <p className="text-xs text-muted-foreground">
              Cadastrado antes como texto: <strong>{herdado}</strong>. Selecione a pessoa acima
              para dar a ela esta obra no Diário.
            </p>
          )}

          {escolhido && (
            <p className="text-xs text-muted-foreground">
              Esta pessoa passa a enxergar a obra no Diário de Obras ao salvar.
            </p>
          )}

          {candidatos?.length === 0 && !isLoading && (
            <p className="text-xs text-muted-foreground">
              Ninguém tem acesso ao Diário ainda. Libere em Administração → Usuários, no
              interruptor “Diário de Obras”.
            </p>
          )}

          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function ConstructionSiteFormFields({
  control,
}: {
  control: Control<ConstructionSiteFormValues>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel required>Nome</FormLabel>
            <FormControl>
              <Input placeholder="Residencial Alpha" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Código</FormLabel>
              <FormControl>
                <Input placeholder="OBR-001" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CONSTRUCTION_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="clientName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cliente</FormLabel>
              <FormControl>
                <Input placeholder="Nome do cliente" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SiteResponsibleField control={control} />
      </div>

      {/* ENDEREÇO DE ENTREGA.
          
          Vem antes de Cidade/UF, que já existiam soltas, para que o bloco se
          leia na ordem em que um endereço é escrito: CEP, rua, número,
          complemento, bairro, cidade. É este endereço que a Ordem de Compra
          imprime — é por ele que o fornecedor sabe onde descarregar. */}
      <div className="flex flex-col gap-1">
        <Label>Endereço de entrega</Label>
        <p className="text-xs text-muted-foreground">
          Sai impresso na Ordem de Compra, para o fornecedor saber onde entregar o material.
        </p>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] gap-4">
        <FormField
          control={control}
          name="zipCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CEP</FormLabel>
              <FormControl>
                <Input placeholder="74000-000" inputMode="numeric" className="w-32" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="addressLine"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Logradouro</FormLabel>
              <FormControl>
                <Input placeholder="Avenida Central" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="addressNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número</FormLabel>
              <FormControl>
                <Input placeholder="1000" className="w-24" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="addressComplement"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Complemento <span className="font-normal text-muted-foreground">(opcional)</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="Portão B, fundos" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="neighborhood"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bairro</FormLabel>
              <FormControl>
                <Input placeholder="Setor Central" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-4">
        <FormField
          control={control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cidade</FormLabel>
              <FormControl>
                <Input placeholder="Curitiba" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>UF</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-20">
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {BRAZILIAN_STATES.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="startDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data de início</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="expectedEndDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Previsão de término</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Descrição</FormLabel>
            <FormControl>
              <Textarea placeholder="Detalhes sobre a obra" rows={3} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
