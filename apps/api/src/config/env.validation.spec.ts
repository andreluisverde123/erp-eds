import { envValidationSchema } from './env.validation';

/// Cobre a regra que impede o erro mais caro de configuração deste sistema:
/// subir em produção com uma string de conexão sem `sslmode`. O driver (`pg`,
/// via `PrismaPg`) não liga TLS sozinho, e o material de configuração descrevia
/// um provedor cuja URL tinha outro formato.

const validEnv = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  CORS_ORIGIN: 'https://app.exemplo.com.br',
};

const validate = (env: Record<string, string>) =>
  envValidationSchema.validate(env, { abortEarly: false });

describe('envValidationSchema — sslmode do Postgres', () => {
  it('recusa produção sem sslmode na DATABASE_URL', () => {
    const { error } = validate({
      ...validEnv,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@host:5432/eds',
      DIRECT_URL: 'postgresql://u:p@host:5432/eds?sslmode=require',
    });

    expect(error).toBeDefined();
    expect(error!.message).toContain('sslmode');
  });

  it('recusa produção sem sslmode na DIRECT_URL (usada pelo migrate)', () => {
    const { error } = validate({
      ...validEnv,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@host/eds?sslmode=require',
      DIRECT_URL: 'postgresql://u:p@host/eds',
    });

    expect(error).toBeDefined();
    expect(error!.message).toContain('sslmode');
  });

  it('aceita o formato do Neon (pooler + endpoint direto, ambos com TLS)', () => {
    const { error } = validate({
      ...validEnv,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@ep-abc-pooler.sa-east-1.aws.neon.tech/eds?sslmode=require',
      DIRECT_URL: 'postgresql://u:p@ep-abc.sa-east-1.aws.neon.tech/eds?sslmode=require',
    });

    expect(error).toBeUndefined();
  });

  /// O `--profile local-db` do compose sobe um Postgres na própria rede do
  /// Docker, sem TLS, e continua rodando com NODE_ENV=production. A regra pede
  /// uma decisão explícita, não TLS a qualquer custo.
  it('aceita sslmode=disable — decisão explícita para banco na própria rede', () => {
    const { error } = validate({
      ...validEnv,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:postgres@postgres:5432/eds?sslmode=disable',
      DIRECT_URL: 'postgresql://postgres:postgres@postgres:5432/eds?sslmode=disable',
    });

    expect(error).toBeUndefined();
  });

  it('não exige sslmode fora de produção', () => {
    const { error } = validate({
      ...validEnv,
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/eds',
      DIRECT_URL: 'postgresql://postgres:postgres@localhost:5432/eds',
    });

    expect(error).toBeUndefined();
  });

  it('continua recusando URL que não seja Postgres', () => {
    const { error } = validate({
      ...validEnv,
      NODE_ENV: 'production',
      DATABASE_URL: 'mysql://u:p@host/eds?sslmode=require',
      DIRECT_URL: 'postgresql://u:p@host/eds?sslmode=require',
    });

    expect(error).toBeDefined();
  });
});
