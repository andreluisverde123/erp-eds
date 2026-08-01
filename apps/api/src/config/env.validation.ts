import * as Joi from 'joi';

/// Validado uma única vez no boot pelo `ConfigModule.forRoot({ validationSchema })`.
/// Se qualquer variável obrigatória faltar ou tiver formato inválido, o
/// processo derruba imediatamente com uma mensagem clara — em vez de subir
/// e falhar de forma obscura na primeira query/requisição que precisar dela.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  DIRECT_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  // Número de proxies confiáveis na frente da API (nginx/ALB = 1). 0 desliga
  // o `trust proxy` do Express — ver o comentário em main.ts.
  TRUST_PROXY: Joi.number().integer().min(0).default(0),

  CORS_ORIGIN: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().optional().default('http://localhost:5173'),
  }),

  // Caminho do cookie httpOnly do refresh token. `/auth` serve quando o front
  // fala direto com a API; num deploy de origem única (nginx repassando
  // `/api`), precisa ser `/api/auth` — ver comentário em `refresh-cookie.ts`.
  REFRESH_COOKIE_PATH: Joi.string().pattern(/^\//).default('/auth'),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  STORAGE_LOCAL_ROOT: Joi.string().default('uploads'),
  S3_BUCKET: Joi.string().when('STORAGE_DRIVER', { is: 's3', then: Joi.required() }),
  S3_REGION: Joi.string().when('STORAGE_DRIVER', { is: 's3', then: Joi.required() }),
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_ACCESS_KEY_ID: Joi.string().when('STORAGE_DRIVER', { is: 's3', then: Joi.required() }),
  S3_SECRET_ACCESS_KEY: Joi.string().when('STORAGE_DRIVER', { is: 's3', then: Joi.required() }),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(false),

  /// Só de demonstração. Quando `true`, `prisma db seed` cria também a empresa
  /// -vitrine com dados de exemplo e senha conhecida — nunca em ambiente
  /// publicado.
  SEED_DEMO: Joi.boolean().default(false),

  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
})
  .unknown(true)
  .required();
