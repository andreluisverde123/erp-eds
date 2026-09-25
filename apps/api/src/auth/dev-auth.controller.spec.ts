import { devLoginEmail } from './dev-auth.controller';
import { envValidationSchema } from '../config/env.validation';

/// O login sem senha só pode existir na máquina do desenvolvedor.
describe('Login de desenvolvimento — travas', () => {
  const LOCAL = 'postgresql://postgres:postgres@localhost:5432/eds?sslmode=disable';
  const NEON =
    'postgresql://u:p@ep-purple-hall-ac4vmsfe.sa-east-1.aws.neon.tech/neondb?sslmode=verify-full';

  it('liga com as três travas: development, e-mail definido e banco local', () => {
    expect(
      devLoginEmail({ nodeEnv: 'development', email: 'admin@eds.app', databaseUrl: LOCAL }),
    ).toBe('admin@eds.app');
  });

  it('não liga fora de development', () => {
    for (const nodeEnv of ['production', 'staging', 'test', undefined]) {
      expect(devLoginEmail({ nodeEnv, email: 'admin@eds.app', databaseUrl: LOCAL })).toBeNull();
    }
  });

  it('não liga sem o e-mail', () => {
    expect(devLoginEmail({ nodeEnv: 'development', databaseUrl: LOCAL })).toBeNull();
  });

  it('não liga com banco fora da máquina, mesmo em development', () => {
    expect(
      devLoginEmail({ nodeEnv: 'development', email: 'admin@eds.app', databaseUrl: NEON }),
    ).toBeNull();
  });

  it('não liga com URL de banco inválida', () => {
    expect(
      devLoginEmail({ nodeEnv: 'development', email: 'a@b.c', databaseUrl: 'lixo' }),
    ).toBeNull();
  });

  it('a API nem sobe em produção com DEV_LOGIN_EMAIL definido', () => {
    const { error } = envValidationSchema.validate(
      {
        NODE_ENV: 'production',
        DEV_LOGIN_EMAIL: 'admin@eds.app',
        DATABASE_URL: NEON,
        DIRECT_URL: NEON,
        JWT_ACCESS_SECRET: 'x'.repeat(40),
        JWT_REFRESH_SECRET: 'y'.repeat(40),
        CORS_ORIGIN: 'https://gestaoeds.com.br',
      },
      { abortEarly: false, allowUnknown: true },
    );
    expect(error?.message).toMatch(/DEV_LOGIN_EMAIL/);
  });
});
